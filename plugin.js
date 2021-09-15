const postcss = require('postcss');
const util = require('util');
const fs = require('fs');
const sass = require('node-sass');
const path = require('path');
const pretty = require('pretty');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const readdir = util.promisify(fs.readdir);

const postcssSass = require('postcss-sass');

class ZipperMerge {
    inputPath = "../src";

    constructor() {
        this.init();
    }

    async init() {
        const renderedSass = await this.renderSass();
        const cleanedSass = this.scssToSass(renderedSass);
        const postCssOutput = postcssSass.parse(cleanedSass);
        const html = this.traverse(postCssOutput);
        const prettyHtml = pretty(html);

        console.log(cleanedSass);

        if (!fs.existsSync(path.join(__dirname, './build'))) fs.mkdirSync(path.join(__dirname, './build'));
        await writeFile(path.join(__dirname, './build/index.html'), prettyHtml);
        await writeFile(path.join(__dirname, './build/index.css'), renderedSass);
        return;
    }

    scssToSass(string) {
        return string.replace(/{/g, '').replace(/}/g, '').replace(/;/g, '');
    }

    traverse(obj) {
        let contents = "\n";
        if (obj.nodes) {
            for (const node of obj.nodes) {
                if (node.type === "rule") {
                    const text = this.getTextDeclaration(node)[0] || '';
                    const atts = this.getHtmlAttributes(node);
                    const splitSelector = node.selector.split(' ');
                    const singleSelector = splitSelector[splitSelector.length - 1];
                    contents += this.htmlFromSelector(singleSelector, this.traverse(node), text, atts);
                }
            }
        }
        return contents;
    }

    // Get the HTML attributes in the node to insert into the HTML
    getHtmlAttributes(node) {
        return node.nodes.filter(node => node.type === "decl" && node.prop.charAt(0) === "-").map(decl => `${decl.prop.slice(1)}=${decl.value}`).join(' ');
    }

    // Get the text prop in the CSS to insert into the HTML
    getTextDeclaration = (node) =>
        node.nodes
            .filter(node => node.type === "decl" && node.prop === "text")
            .reverse().map((decl) => {
                return this.removeQuotes(decl.value);
            });

    removeQuotes(value) {
        const firstVal = value.charAt(0);
        const lastVal = value.charAt(value.length - 1);
        if (firstVal === "'" || firstVal === '"') value = value.slice(1);
        if (lastVal === "'" || lastVal === '"') value = value.slice(0, value.length - 1);
        return value;
    }

    htmlFromSelector(selector, traversal, innerText = "", atts) {
        if (selector.startsWith('#') || selector.startsWith('.')) selector = 'div' + selector;
        const arr = [
            [/#([\w-]+)/, ` id="$1"`],
            [/((\.[\w-]+)+)/, (_, c) => ` class="${c.split`.`.join` `.trim()}"`],
            [/(\[.+?\])/g, (_, a) => " " + a.slice(1, -1)],
            [/([\S]+)(.*)/, `<$1$2 ${atts}>${innerText}${traversal}</$1>`]
        ].map((replacement) => {
            const regex = replacement[0];
            const str = replacement[1];
            selector = selector.replace(regex, str);
            return selector;
        }
        )[3];
        return arr;
    }

    // Render SCSS file
    async renderSass() {
        const sassContents = await readFile(path.join(__dirname, './src/index.scss'), "utf8");
        const result = sass.renderSync({
            data: sassContents,
            outputStyle: 'nested'
        });
        return result.css.toString();
    }

    // Gets all file paths in a directory
    async getAllFilePaths(dirPath, arrayOfFiles) {
        let files = [];
        try {
            files = await readdir(dirPath);
        } catch (err) {
            console.error('Cannot read directory', err);
            return files;
        }
        arrayOfFiles = arrayOfFiles || [];
        for (const file of files) {
            if (fs.statSync(dirPath + "/" + file).isDirectory()) {
                arrayOfFiles = await this.getAllFilePaths(dirPath + "/" + file, arrayOfFiles);
            } else {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
        return arrayOfFiles;
    }

}

new ZipperMerge();

//const root = postcss.parse(css, {});

// Get the styles of the declaration
const getStyles = (node, filterInvalidDecls) =>
    node.nodes
        .filter((node) => {
            if (filterInvalidDecls && node.type === "decl") {
                // List of declarations to find
                const filterProps = [
                    { key: 'text', exact: true },
                    { key: ']', exact: false }
                ];
                const inFilter = filterProps.find(item => item.exact ? item.key === node.prop : node.prop.includes(item.key));
                return !inFilter;
            } else return node.type === "decl";
        }) // Only include declarations, exclude text declarations
        .map(decl => decl.toString() + ";") // Convert declarations to CSS strings
        .join('\n\t'); // Join declarations to string