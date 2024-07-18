
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
                id: row?.id,
                name: row.name,
                FirstName: row.FirstName,
                SecondName: row.SecondName,
                Hint: row.Hint,
                BirthDate: row.BirthDate,
                Genre: row.Genre?.trim(),
                age: parseFloat(row.CurrentAge),
                KnownFor: row.KnownFor,
                image: row.image,
                copyrightTerms: row.copyrightTerms,
                AttributedNeeded: row.AttributedNeeded?.trim().toUpperCase() === 'TRUE',
                category: row.category,
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

const inputFilePath = 'Celebrities.csv';
const outputFilePath = path.join(__dirname, 'celebrities_details.json'); // Adjust the output file path as needed

loadItemsFromCSV(inputFilePath, outputFilePath);
