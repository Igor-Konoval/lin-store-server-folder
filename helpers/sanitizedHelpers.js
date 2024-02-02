const sanitizeHTML = require("sanitize-html");

const sanitizedData = (data) => {
    if (Array.isArray(data)) {
        return data.map(sanitizedData);
    } else if (typeof data === 'object' && data !== null) {
        const sanitizedObject = {};
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                sanitizedObject[key] = sanitizedData(data[key]);
            }
        }
        return sanitizedObject;
    } else if (typeof data === 'string') {
        return sanitizeHTML(data);
    } else {
        return data;
    }
};

module.exports = sanitizedData;