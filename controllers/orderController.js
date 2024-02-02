const OrderModel = require("../models/Order");
const ProductModel = require("../models/Product");
const UserModel = require("../models/User");
const BasketModel = require("../models/Basket");
const jwt = require("jsonwebtoken");
const {CommentUserModel} = require("../models/CommentUser");
const GoogleUserModel = require("../models/GoogleUser");
const axios = require("axios");
const sanitizedData = require("../helpers/sanitizedHelpers");
const nodemailer = require("nodemailer");

class OrderController {
    async getOrder(req, res) {
        try {
            const accessToken = sanitizedData(req.cookies.accessToken);
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const orderUser = await OrderModel.find({ userId: token.userId });

            const productsId = orderUser
                .map(order => order.products.map(product => product._id))
                .flat();
            const statusHistory = (statusCode ,citySender, cityRecipient, dateDelivery, DateReceived) => {
                const infoStatus = {
                    1: "Створено",
                    2: "Видалено",
                    3: "Номер не знайдено",
                    4: `Відправлення у місті ${citySender}`,
                    41: `Відправлення у місті ${citySender}`,
                    5: `Відправлення прямує до міста ${cityRecipient}`,
                    6: `Відправлення у місті ${cityRecipient}, орієнтовна доставка до ВІДДІЛЕННЯ ${dateDelivery}. Очікуйте додаткове повідомлення про прибуття`,
                    7: "Прибув до пункту призначення",
                    8: "Прибув на відділення (завантажено в Поштомат)",
                    9: "Відправлення отримано",
                    10: `Відправлення отримано ${DateReceived}. Протягом доби ви одержите SMS-повідомлення про надходження грошового переказу та зможете отримати його в касі відділення «Нова пошта»`,
                    11: `Відправлення отримано ${DateReceived}. Грошовий переказ видано одержувачу.`,
                    12: "Нова Пошта комплектує ваше відправлення",
                    101: "На шляху до одержувача",
                    102: "Відмова від отримання (Відправником створено замовлення на повернення)",
                    103: "Відмова одержувача (отримувач відмовився від відправлення)",
                    104: "Змінено адресу",
                    105: "Припинено зберігання",
                    106: "Одержано і створено ЄН зворотньої доставки",
                    111: "Невдала спроба доставки через відсутність Одержувача на адресі або зв'язку з ним",
                    112: "Дата доставки перенесена Одержувачем",
                }

                const statusArr = [];

                if (statusCode === 2) {
                    statusArr.push(infoStatus[2]);
                    return statusArr;
                }

                if (statusCode >= 101) {
                    statusArr.push(infoStatus[statusCode]);
                    return statusArr;
                }

                for (let i = 1; i <= statusCode; i++) {
                    if (i === 3 || i === 2 || i === 8) {
                        continue;
                    } else {
                        statusArr.push(infoStatus[i])
                    }
                }
                return statusArr.reverse();
            }

            const fetchSingleTrack = async (product) => {
                const response = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                    apiKey: process.env.API_KEY,
                    modelName: "TrackingDocument",
                    calledMethod: "getStatusDocuments",
                    methodProperties: {
                        Documents: [{ DocumentNumber: product.TTN }]
                    }
                });

                const statusCode = response.data.data[0].StatusCode;
                const cityRecipient = response.data.data[0].CityRecipient;
                const citySender = response.data.data[0].CitySender;
                const dateDelivery = response.data.data[0].ScheduledDeliveryDate;
                const DateReceived = response.data.data[0].RecipientDateTime;
                const statusData = statusHistory(statusCode, citySender, cityRecipient, dateDelivery, DateReceived);

                if (product.status !== statusCode) {
                    await OrderModel.findByIdAndUpdate(product._id, {
                        status: statusCode
                    });
                }

                if (product.received === false && (product.status === 9 || product.status === 10 || product.status === 11)) {
                    for (const orderProduct of product.products) {
                        await ProductModel.updateMany(
                            { _id: { $in: [orderProduct._id] } },
                            { $inc: { countSales: orderProduct.count } }
                        );
                    }

                    await OrderModel.findByIdAndUpdate(product._id, {
                        received: true
                    });
                }

                const resultStatus = {
                    deliveryCost: response.data.data[0].DocumentCost,
                    deliveryData: dateDelivery,
                    warehouseRecipient: response.data.data[0].WarehouseRecipient
                };

                return { ...product._doc, status: statusData, resultStatus };
            };

            const fetchWithRetry = async (product) => {
                const maxRetries = 3;
                let retries = 0;

                while (retries < maxRetries) {
                    try {
                        return await fetchSingleTrack(product);
                    } catch (error) {
                        console.error(`Error fetching TTN ${product.TTN}: ${error.message}`);
                        retries++;
                    }
                }

                throw new Error(`Failed to fetch TTN ${product.TTN} after ${maxRetries} retries`);
            };

            const fetchTrack = orderUser.map(fetchWithRetry);

            const resultStatus = await Promise.all(fetchTrack);

            const products = await ProductModel.find({ _id: { $in: productsId } });
            const updatedOrderUser = resultStatus.reverse().map(order => {
                const updatedProducts = order.products.map(product => {
                    const matchingProduct = products.find(p => p._id.equals(product._id));
                    return matchingProduct ? { ...matchingProduct.toObject(), count: product.count } : product;
                });

                return { ...order,
                    products: updatedProducts };
                }
            );

            return res.json(updatedOrderUser);
        } catch (e) {
            console.log(e)
            res.status(408).json({ message: e.message });
        }
    }

    async cancelOrder (req, res) {
        try {
            const {orderNumber, TTN} = req.body;

            const accessToken = sanitizedData(req.cookies.accessToken);
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidOrderNumber = sanitizedData(orderNumber);
            const isValidTTN = sanitizedData(TTN);

            if ( isValidOrderNumber.length === 0 || isValidTTN.length === 0  ) {
                return res.json({ message: "Виникла помилка" });
            }

            const user = await UserModel.findById(token.userId);
            const googleUser = await GoogleUserModel.findById(token.userId);
            if (!user && !googleUser) {
                res.json({message: "помилка клієнта, пройдіть авторизацію"})
            }

            const order = await OrderModel.find({TTN: isValidTTN, orderNumber: isValidOrderNumber})
            if ( !order || order.length === 0 ) {
                return res.json({ message: "Виникла помилка" });
            }

            const orderInfo = order[0].info[order[0].info.length - 1]
            if (
                order[0].isCancel ||
                orderInfo.includes("скасовано продавцем через нестачу на складі") ||
                orderInfo.includes("замовлення скасовано покупцем")
            ) {
                return res.json("замовлення вже скасовано")
            }

            if ( order[0].status !== 1 ) {
                return res.json("замовлення неможливо скасувати")
            }

            const result = await OrderModel.updateMany(
                {TTN: isValidTTN, orderNumber: isValidOrderNumber},
                {isCancel: true, $push: {info: "замовлення скасовано покупцем"}}
            )

            const orderProducts = order[0].products;

            const productsId = orderProducts.map(value => value._id);

            const products = await ProductModel.find({ _id: { $in: productsId } });

            for (const product of orderProducts) {

                const productId = product._id;
                const color = product.color;
                const count = product.count;

                const productToUpdate = products.find(p => p._id.equals(productId));

                if (productToUpdate) {
                    const colorToUpdate = productToUpdate.colors.find(c => c.color === color);

                    if (colorToUpdate) {
                        colorToUpdate.count += count;
                    }
                }
            }

            await Promise.all(products.map(product => product.save()));

            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "password",
                    user: process.env.EMAIL,
                    pass: process.env.PASSWORD
                }
            })
            const mailOptions = {
                from: process.env.EMAIL,
                to: process.env.ADMIN_EMAIL,
                subject: "Отмена заказа",
                html: `
                    <!DOCTYPE html>
                        <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Отмена заказа</title>
                            </head>
                            <body style="font-family: 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
                                <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 0 10px rgba(145,141,141,0.1);">
                                    <h2>Номер накладной ${TTN}</h2>
                                    <h2>Номер заказа на сайте ${orderNumber}</h2>
                                    <h2>Отменён покупателем по его решению</h2>
                                </div>
                            </body>
                    </html>
                    `
            };
            await transporter.sendMail(mailOptions);

            res.json('ok')
        } catch (e) {
            console.log(e, e.message)
            res.json({message: e.message})
        }
    }

    async identifyCity (req, res){
        try {
            const {city} = req.body;

            const isValidCity = sanitizedData(city);

            if ( isValidCity.length === 0 ) {
                return res.json({ message: "Виникла помилка" });
            }

            const result = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "Address",
                calledMethod: "getCities",
                methodProperties: {
                    Page: 1,
                    FindByString: isValidCity,
                    Limit: 20
                }
            })

            if (!result.data.success) {
                return res.json("")
            }

            const resultCity = result.data.data.map(value => ({
                present: `${value.SettlementTypeDescription} ${value.Description}, ${value.AreaDescription} обл.`,
                ref: value.Ref
            }))

            return res.json(resultCity);
        } catch (e) {
            return res.json({message: e.message})
        }
    }

    async getStreet (req, res) {
        try {
            const {cityRef, street} = req.body;

            const isValidCityRef = sanitizedData(cityRef);
            const isValidStreet = sanitizedData(street);

            if (
                isValidStreet.length === 0 || isValidCityRef.length === 0
            ) {
                return res.json({ message: "Виникла помилка" });
            }

            const result = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "Address",
                calledMethod: "getStreet",
                methodProperties: {
                    CityRef: isValidCityRef,
                    FindByString: isValidStreet,
                }
            })

            const streetRecipient = result.data.data.map( value => ({
                street: `${value.StreetsType} ${value.Description}`,
                ref: value.Ref
            }))

            return res.json(streetRecipient);
        } catch (e) {
            return res.json({message: e.message})
        }
    }

    async identifyDepartment (req, res) {
        try {
            const {cityRef} = req.body;

            const isValidCityRef = sanitizedData(cityRef);

            if (isValidCityRef.length === 0) {
                return res.json({message: "Виникла помилка"});
            }

            const result = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "Address",
                calledMethod: "getWarehouses",
                methodProperties: {
                    CityRef : isValidCityRef,
                    Language : "UA",
                }
            })

            const department = result.data.data.map(value => ({
                description: value.Description,
                ref: value.Ref,
                warehouseIndex: value.WarehouseIndex
            }))

            return res.json(department);
        } catch (e) {
            return res.json({message: e.message})
        }
    }

    async createDocument (req, res) {
        try {
            const {
                recipientsWarehouse,
                cityRecipient,
                recipientAddress,
                recipientsPhone,
                firstname,
                surname,
                lastname,
                email,
                productList
            } = req.body;

            const isValidRecipientsWarehouse = sanitizedData(recipientsWarehouse)
            const isValidCityRecipient = sanitizedData(cityRecipient)
            const isValidRecipientAddress = sanitizedData(recipientAddress)
            const isValidRecipientsPhone = sanitizedData(recipientsPhone)
            const isValidFirstname = sanitizedData(firstname)
            const isValidSurname = sanitizedData(surname)
            const isValidLastname = sanitizedData(lastname)
            const isValidEmail = sanitizedData(email)
            const isValidProductList = sanitizedData(productList)

            if (
                isValidRecipientsWarehouse.length === 0 ||
                isValidCityRecipient.length === 0 ||
                isValidProductList.length === 0 ||
                isValidRecipientAddress.length === 0 ||
                isValidRecipientsPhone.length === 0 ||
                isValidFirstname.length === 0 ||
                isValidSurname.length === 0 ||
                isValidLastname.length === 0 ||
                isValidEmail.length === 0
            ) {
                return res.json({ message: "Виникла помилка" });
            }

            const accessToken = sanitizedData(req.cookies.accessToken);
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const user = await UserModel.findById(token.userId);
            const googleUser = await GoogleUserModel.findById(token.userId);
            if (!user && !googleUser) {
                return res.json({message: "помилка клієнта, пройдіть авторизацію"})
            }

            const productsId = isValidProductList.map(value => value._id);

            const products = await ProductModel.find({_id: { $in: productsId }})

            let i = 0;
            for (const value of isValidProductList) {
                const findColor = products[i].colors.find( item => item.color === value.selectedColor);

                const isValidCount = value.selectedCount <= findColor.count;

                if (!isValidCount) {
                    return res.json(`${products[i].name} немає в наявності :(`)
                }
                i++
            }

            const productsArrObjs = isValidProductList.map( value => ( {_id: value._id, color: value.selectedColor, count: value.selectedCount} ))

            const totalPrice = isValidProductList.reduce( (prev, cur) => prev + cur.price, 0 )

            const updateProducts = isValidProductList.map(value => ({ _id: value._id, name: value.name, img: value.img, selectedColor: value.selectedColor, selectedCount: value.selectedCount }));

            const bulkUpdateOps = updateProducts.map(update => ({
                updateOne: {
                    filter: { _id: update._id, "colors.color": update.selectedColor },
                    update: { $inc: { "colors.$.count": -update.selectedCount } }
                }
            }));

            await ProductModel.bulkWrite(bulkUpdateOps);

            const counterparty = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "Counterparty",
                calledMethod: "save",
                methodProperties: {
                    FirstName : isValidFirstname,
                    MiddleName : isValidSurname,
                    LastName : isValidLastname,
                    Phone : isValidRecipientsPhone,
                    Email : isValidEmail,
                    CounterpartyType : "PrivatePerson",
                    CounterpartyProperty : "Recipient"
                }
            })

            const resultRecipient = {
                recipientRef: counterparty.data.data[0].Ref,
                contactRecipient: counterparty.data.data[0].ContactPerson.data[0].Ref
            };

            const descriptionProducts = isValidProductList.map( value => value.name + " " + value.selectedColor ).join(', ');

            const result = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "InternetDocument",
                calledMethod: "save",
                methodProperties: {
                    SenderWarehouseIndex : "...",// "121/102",
                    RecipientWarehouseIndex : isValidRecipientsWarehouse,//"97/13",// "141/102",
                    PayerType : "Recipient",
                    PaymentMethod : "Cash",
                    // DateTime : "дд.мм.рррр",
                    CargoType : "Parcel",
                    // VolumeGeneral : "0.45",
                    Weight : "0.4",
                    ServiceType : "WarehouseWarehouse",
                    SeatsAmount : "1",
                    Description : descriptionProducts,
                    Cost : totalPrice,

                    CitySender : process.env.CITY_SENDER, //"CityRef"
                    Sender : process.env.SENDER,
                    SenderAddress : process.env.SENDER_ADDRESS, //getStreet
                    ContactSender : process.env.CONTACT_SENDER, //contactSender
                    SendersPhone : process.env.SENDERS_PHONE, //contactSender

                    CityRecipient : isValidCityRecipient, //"CityRef"
                    Recipient : resultRecipient.recipientRef,  //createCounterparty
                    RecipientAddress : isValidRecipientAddress,  //getStreet
                    ContactRecipient : resultRecipient.contactRecipient,  //createCounterparty
                    RecipientsPhone : recipientsPhone
                }
            })

            const timestamp = new Date().getTime();
            const randomPart = Math.floor(Math.random() * 10000).toFixed(10);

            const orderNumber = +`${timestamp}${randomPart}`;

            const orderCustomer = await OrderModel.create({
                products: productsArrObjs,
                userId: token.userId,
                price: totalPrice,
                status: 1,
                info: ["очікування на підтвердження продавцем"],
                orderNumber,
                typeDelivery: "Нова Пошта",
                TTN: result.data.data[0].IntDocNumber
            })

            const allAdmins = await UserModel.find({ role: "Admin" });
            const allGoogleAdmins = await GoogleUserModel.find({ role: "Admin" });

            const createOrdersPromises = allAdmins.concat(allGoogleAdmins).map(async (admin) => {
                return OrderModel.create({
                    products: productsArrObjs,
                    userId: admin._id,
                    price: totalPrice,
                    status: 1,
                    info: ["очікування на підтвердження продавцем"],
                    orderNumber,
                    typeDelivery: "Нова Пошта",
                    TTN: result.data.data[0].IntDocNumber,
                });
            });

            await Promise.all(createOrdersPromises);

            const removeProductsBasket = isValidProductList.map(value => ({
                productId: value._id,
                color: value.selectedColor
            }));

            await BasketModel.updateOne(
                { userId: token.userId },
                { $pull: { products: { $or: removeProductsBasket } } }
            );

            const totalResult = {
                info: "замовлення створено",
                TTN: result.data.data[0].IntDocNumber,
                costDelivery: result.data.data[0].CostOnSite,
                dateRecip: result.data.data[0].EstimatedDeliveryDate,
                totalPrice: totalPrice + result.data.data[0].CostOnSite,
            }

            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "password",
                    user: process.env.EMAIL,
                    pass: process.env.PASSWORD
                }
            })

            const mailOptions = {
                from: process.env.EMAIL,
                to: process.env.ADMIN_EMAIL,
                subject: "Подтверждение заказа",
                html: `
                    <!DOCTYPE html>
                        <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Подтвердить заказ</title>
                            </head>
                            <body style="font-family: 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
                                <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 0 10px rgba(145,141,141,0.1);">
                                    <h2>Номер накладной ${result.data.data[0].IntDocNumber}</h2>
                                    <h2>Номер заказа на сайте ${orderNumber}</h2>
                                    ${updateProducts.map( product =>
                                        `<div style="display: flex; align-items: center; margin: 20px 0px">
                                            <img style="width: 200px; height: 200px; margin-right: 25px" src="${product.img}" alt="image-device">
                                            <div>
                                                <h2>${product.name}</h2>
                                                <p>цвет: ${product.selectedColor}</p>
                                                <p>количество: ${product.selectedCount}</p>
                                            </div>
                                        </div>
                                        <hr/>`
                                    )}
                                    <div style="text-align: right; margin-top: 18px">
                                        <a href="${process.env.CLIENT_APP}order/acceptOrder/${orderNumber}" style="background-color: rgb(188 188 100); border-radius: 12px; color: black; padding: 10px; font-size: 25px; text-decoration: none; ">подтвердить</a>
                                        <a href="${process.env.CLIENT_APP}order/rejectOrder/${orderNumber}" style="background-color: rgb(188 188 100); border-radius: 12px; color: black; padding: 10px; font-size: 25px; margin-left: 30px; text-decoration: none">отменить</a>
                                    </div>
                                    <p style="text-align: right; font-size: 24px;">общая стоимость ${totalPrice} грн</p>
                                </div>
                            </body>
                    </html>
                    `
            };
            await transporter.sendMail(mailOptions);

            return res.json(totalResult);
        } catch (e) {
            console.log(e)
            return res.status(500).json("Виникла помилка")
        }
    }

    async acceptOrder (req, res) {
        try {
            let orderNumber = sanitizedData(+req.params.orderNumber);

            const accessToken = sanitizedData(req.cookies.accessToken);
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            if (token.role !== "Admin") {
                return res.status(400).json({message: "відмовлено в доступі"})
            }

            const isAdmin = await UserModel.findOne({_id: token.userId, role: token.role});
            const isGoogleAdmin = await GoogleUserModel.findOne({_id: token.userId, role: token.role});
            if (!isAdmin && !isGoogleAdmin) {
                return res.status(400).json({message: "відмовлено в доступі"})
            }

            const checkOrder = await OrderModel.findOne({orderNumber});
            if (checkOrder.info[checkOrder.info - 1] === "підтверджений продавцем") {
                return res.json("ok");
            }

            const result = await OrderModel.updateMany(
                {orderNumber},
                {
                    $push: {info: "підтверджений продавцем"}
                });
            if (result.modifiedCount > 0) {
                return res.json("ok");
            } else {
                return res.status(400).json({ message: "Виникла помилка" });
            }
        } catch (e) {
            console.error(e);
            return res.status(500).json("Виникла помилка");
        }
    }

    async rejectOrder (req, res) {
        try {
            let orderNumber = sanitizedData(+req.params.orderNumber);

            const accessToken = sanitizedData(req.cookies.accessToken);
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            if (token.role !== "Admin") {
                return res.status(400).json({message: "відмовлено в доступі"})
            }

            const isAdmin = await UserModel.findOne({_id: token.userId, role: token.role});
            const isGoogleAdmin = await GoogleUserModel.findOne({_id: token.userId, role: token.role});
            if (!isAdmin && !isGoogleAdmin) {
                return res.status(400).json({message: "відмовлено в доступі"})
            }

            const checkOrder = await OrderModel.findOne({orderNumber});
            if (
                checkOrder.info[checkOrder.info - 1] === "скасовано продавцем через нестачу на складі" ||
                checkOrder.info[checkOrder.info - 1] === "замовлення скасовано покупцем"
            ) {
                return res.json("ok");
            }

            const result = await OrderModel.updateMany(
                {orderNumber},
                {
                    isCancel: true,
                    $push: {info: "скасовано продавцем через нестачу на складі"}
                }
            );

            const orderProducts = checkOrder.products;

            const productsId = orderProducts.map(value => value._id);

            const products = await ProductModel.find({ _id: { $in: productsId } });

            for (const product of orderProducts) {

                const productId = product._id;
                const color = product.color;
                const count = product.count;

                const productToUpdate = products.find(p => p._id.equals(productId));

                if (productToUpdate) {
                    const colorToUpdate = productToUpdate.colors.find(c => c.color === color);

                    if (colorToUpdate) {
                        colorToUpdate.count += count;
                    }
                }
            }

            await Promise.all(products.map(product => product.save()));

            if (result.modifiedCount > 0) {
                return res.json("ok");
            } else {
                return res.status(400).json({ message: "Виникла помилка" });
            }
        } catch (e) {
            console.error(e);
            return res.status(500).json("Виникла помилка");
        }
    }

    async checkDetails (req, res) {
        try {
            const {cityRecipient, weight, cost, seatsAmount, packCount} = req.body;

            const isValidCityRecipient = sanitizedData(cityRecipient)
            const isValidWeight = sanitizedData(weight)
            const isValidCost = sanitizedData(cost)
            const isValidSeatsAmount = sanitizedData(seatsAmount)
            const isValidPackCount = sanitizedData(packCount)

            if (isValidCityRecipient.length === 0 ||
                isValidWeight.length === 0 ||
                isValidCost.length === 0 ||
                isValidSeatsAmount.length === 0 ||
                isValidPackCount.length === 0) {
                return res.json({ message: "Виникла помилка" });
            }

            const resultCost = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "InternetDocument",
                calledMethod: "getDocumentPrice",
                methodProperties: {
                    CitySender: process.env.CITY_SENDER,
                    CityRecipient: isValidCityRecipient,
                    Weight: isValidWeight,
                    ServiceType: "WarehouseWarehouse",
                    Cost: isValidCost,
                    CargoType: "Parcel",
                    SeatsAmount: isValidSeatsAmount,
                    // RedeliveryCalculate : {
                    //     "CargoType":"Money",
                    //     "Amount":"100"
                    // },
                    PackCount : isValidPackCount,
                    // CargoDetails : [
                    //     {
                    //         "CargoDescription":"00000000-0000-0000-0000-000000000000",
                    //         "Amount":"2"
                    //     }
                    // ],
                    // "CargoDescription" : "00000000-0000-0000-0000-000000000000"
                }
            })

            const resultDelivery = await axios.post("https://api.novaposhta.ua/v2.0/json/", {
                apiKey: process.env.API_KEY,
                modelName: "InternetDocument",
                calledMethod: "getDocumentDeliveryDate",
                methodProperties: {
                    ServiceType : "WarehouseWarehouse",
                    CitySender: process.env.CITY_SENDER,
                    CityRecipient: isValidCityRecipient,
                }
            })

            const totalResult = {
                costInfo: resultCost.data.data[0],
                deliveryInfo: resultDelivery.data.data[0].DeliveryDate
            }

            return res.json(totalResult);
        } catch (e) {
            return res.json({message: e.message})
        }
    }

    async checkOrderForCom (req, res) {
        try {
            const {productId} = req.params;

            const isValidProductId = sanitizedData(productId);

            if (isValidProductId.length === 0) {
                return res.json({ message: "Виникла помилка" });
            }

            const accessToken = sanitizedData(req.cookies.accessToken);
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const checkOrder = await OrderModel.findOne({
                userId: token.userId,
                products: {
                    $elemMatch: {
                        _id: isValidProductId
                    }
                }
            });

            if (!checkOrder) {
                return res.json({message: {isGetProduct: false, isSetRating: false}})
            }

            const isExistComment = await CommentUserModel.find({
                productId: isValidProductId,
                userId: token.userId
            })
            const checkRating = isExistComment.filter( comment => comment.rating > 0).length > 0;

            const checkStatus = () => {
                if (checkOrder.status === 9 || checkOrder.status === 10 || checkOrder.status === 11) {
                    return true;
                } else {
                    return false;
                }
            }
            const isGetProduct = checkStatus();

            return res.json({message: {isGetProduct, isSetRating: checkRating, status: checkOrder.status}})
        } catch (e) {
            res.json({message: e.message})
        }
    }
}

module.exports = new OrderController();