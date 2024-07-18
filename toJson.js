
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

// Function to load items from a CSV file and save them as a JSON file
const loadItemsFromCSV = async (filePath, outputFilePath) => {
    const items = [];

    fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row) => {
            console.log(row);
            const item = {
                brand: row.brand,
                name: row.name,
                category: row.category,
                id: row.id,
                code: row.code,
                url: row.url,
                price: parseFloat(row.price),
                currency: row.currency,
                gender: row.gender,
                description: row.description,
                color: row.color,
                from: row.from,
                info: row.info,
                image: row.image.split(',').map((image) => image.replace(/\\|"/g, '')), // Clean up the image array
            };
            // item.imagesUrl = [""]
            console.log(item)
            items.push(item);
        })
        .on('end', () => {
            fs.writeFile(outputFilePath, JSON.stringify(items, null, 2), (err) => {
                if (err) {
                    console.error('Error writing JSON file:', err);
                } else {
                    console.log('Data successfully written to JSON file');
                }
            });
        });
};

const inputFilePath = 'footwear.csv';
const outputFilePath = path.join(__dirname, '_details.json'); // Adjust the output file path as needed

loadItemsFromCSV(inputFilePath, outputFilePath);
