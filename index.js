const ZipperMerge = require('./ZipperMerge');

const zipperMerge = async (inputPath, outputFolder) => {
    const zm = new ZipperMerge();
    await zm.init(inputPath, outputFolder);
}

module.exports = zipperMerge;
