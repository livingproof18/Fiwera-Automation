const fs = require('fs');
const path = require('path');

// Function to get the file type of an image
function getImageType(imageName) {
    console.log("getImageType :" + imageName)
    const extensions = ['jpg', 'jpeg', 'png', 'avif'];
    for (let ext of extensions) {
        const imagePath = path.join(__dirname, 'clothing', `${imageName}.${ext}`);
        console.log("Checking path:", imagePath);
        if (fs.existsSync(imagePath)) {
            console.log("Image path exists");
            return ext; // Return the extension if the file exists
        }
    }
    return null;
}

// Main function to update the JSON file with image types
async function main() {
    const inputFilePath = path.join(__dirname, 'productGPT_details.json');
    const outputFilePath = path.join(__dirname, 'product_details2.json');

    let products = [];

    if (fs.existsSync(inputFilePath)) {
        const rawData = fs.readFileSync(inputFilePath);
        products = JSON.parse(rawData);
    }

    products.forEach(product => {
        if (product.image && product.image.length > 0) {
            const imageName = product.image[0];
            const imageType = getImageType(imageName);
            console.log(" reutrn imageType " + imageType)
            if (imageType) {
                product.type = imageType;
            } else {
                product.type = "unknown";
            }
        } else {
            product.type = "unknown";
        }
    });

    fs.writeFileSync(outputFilePath, JSON.stringify(products, null, 2));
    console.log(`Updated product details saved to ${outputFilePath}`);
}

main();
