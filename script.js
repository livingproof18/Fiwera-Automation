// import OpenAI from "openai";
// import { config } from "dotenv";
const fs = require('fs');
const path = require('path');
const { Configuration, OpenAI } = require('openai');
const { config } = require('dotenv')

config()
// console.log(process.env.OPENAI_API_KEY)

// return;
// Load OpenAI API key from environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Replace with your actual API key
const INPUT_FILE = "nike.json";
const OUTPUT_FILE = "nikeFinal.json";
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// Function to summarize product descriptions
async function summarizeDescription(brand, name, category, description) {
    console.log(`summarizeDescription Brand: ${brand}\nName: ${name}\nCategory: ${category}\nDescription: ${description}`)
    const messages = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `The product details are as follows:\nBrand: ${brand}\nName: ${name}\nCategory: ${category}\nDescription: ${description}\n\nPlease summarize the product description into a concise and engaging summary without repeating the brand, name, or category directly.` },
    ];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
        });

        console.log(response)

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error summarizing description:', error);
        return null;
    }
}

// Main function to read products, summarize descriptions, and save new data
async function main() {
    const inputFilePath = path.join(__dirname, INPUT_FILE);
    const outputFilePath = path.join(__dirname, OUTPUT_FILE);

    let products = [];

    if (fs.existsSync(inputFilePath)) {
        const rawData = fs.readFileSync(inputFilePath);
        products = JSON.parse(rawData);
    }

    for (let i = 0; i < products.length; i++) {
        let product = products[i];
        if (product.description) {
            const summary = await summarizeDescription(product.Brand, product.name, product.category, product.description);
            console.log("summary result :" + summary)
            if (summary) {
                product.description = summary;
            } else {
                product.description = "";
            }
        }
    }

    fs.writeFileSync(outputFilePath, JSON.stringify(products, null, 2));
    console.log(`Summarized descriptions saved to ${outputFilePath}`);
}

main();