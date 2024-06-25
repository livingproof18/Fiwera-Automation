const fs = require('fs');
const path = require('path');

function start() {
    console.log("start");
    let existingData = [];
    if (fs.existsSync('acero_details.json')) {
        const rawData = fs.readFileSync('acero_details.json');
        existingData = JSON.parse(rawData);
    }
    console.log(existingData)
    console.log(existingData.length)
}


start()

