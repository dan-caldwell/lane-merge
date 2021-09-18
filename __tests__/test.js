const ZipperMerge = require('../ZipperMerge');
const path = require('path');

const inputPath = path.join(__dirname, './input.test.scss');

const trim = (input) => input.replace(/[\s\n\t]/g, '');

test("Gets sass contents", async () => {
    const zm = new ZipperMerge();
    const sassContents = await zm.getSassContents(inputPath);
    const trimmed = trim(sassContents);
    expect(trimmed).toBe(`$bg:#f5f6f9;$text:"HelloWorld";html{head{link{-rel:"stylesheet";-href:"index.css";}}body{background:$bg;a{-href:"https://google.com";h1{text:$text;}}}}a{text-decoration:none;}`);
});

test("Creates correct output", async () => {
    const zm = new ZipperMerge();
    const { html, css } = await zm.getOutput(inputPath);
    const trimmedHtml = trim(html);
    const trimmedCss = trim(css);
    expect(trimmedHtml).toBe(`<html><head><linkrel="stylesheet"href="index.css"></link></head><body><ahref="https://google.com"><h1>HelloWorld</h1></a></body></html>`);
    expect(trimmedCss).toBe(`htmlbody{background:#f5f6f9;}a{text-decoration:none;}`);
});
