const fs = require('fs');
const path = require('path');

function start() {
    console.log("start");
    let existingData = [];
    if (fs.existsSync('product_details.json')) {
        const rawData = fs.readFileSync('product_details.json');
        existingData = JSON.parse(rawData);
    }
    console.log(existingData)
    console.log(existingData.length)
}


start()

