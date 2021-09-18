const postcss = require('postcss');
const util = require('util');
const fs = require('fs');
const sass = require('node-sass');
const path = require('path');
const pretty = require('pretty');
const cssbeautify = require('cssbeautify');
// Modify raw SCSS
const postcssScss = require('postcss-scss');
// Modify raw Sass
const postcssSass = require('postcss-sass');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const readdir = util.promisify(fs.readdir);

class ZipperMerge {

    // Initialize
    async init(inputPath, outputFolder) {
        if (!outputFolder) outputFolder = "./build";
        const { html, css } = await this.getOutput(inputPath);
        
        if (!fs.existsSync(path.join(__dirname, outputFolder))) fs.mkdirSync(path.join(__dirname, outputFolder));
        await writeFile(path.join(__dirname, `${outputFolder}/index.html`), html);
        await writeFile(path.join(__dirname, `${outputFolder}/index.css`), css);
    }

    // Gets the final string output
    async getOutput(inputPath) {
        if (!inputPath) inputPath = path.join(__dirname, './src/index.scss');

        const sassContents = await this.getSassContents(inputPath);
        const parsedScss = postcssScss.parse(sassContents);

        // Insert the filler attributes for empty rules
        this.fillerDeclForEmptyNodes(parsedScss);

        const sassContentsWithFillers = parsedScss.toString();

        const renderedSass = await this.renderSass(sassContentsWithFillers);
        const cleanedSass = this.scssToSass(renderedSass);
        const parsedSass = postcssSass.parse(cleanedSass);

        const parsedSassAtHtmlSelector = this.getHtmlSelectorStart(parsedSass);

        // Remove filler declarations
        this.removeFillers(parsedSassAtHtmlSelector);

        const uglyHtml = this.traverse(parsedSassAtHtmlSelector);
        const html = pretty(uglyHtml);

        // Remove text and attribute declarations
        this.removeInvalidDecls(parsedSassAtHtmlSelector);

        const finalRenderedSass = await this.renderSass(parsedSass.toString());
        const css = cssbeautify(finalRenderedSass.toString());

        return { html, css }
    }

    // Gets the contents of a Sass file (or any file, really)
    async getSassContents(inputPath) {
        return await readFile(inputPath, "utf8");
    }

    // Creates a template loop for postcss objects
    loop(obj, callback) {
        if (obj.nodes) {
            for (const node of obj.nodes) {
                if (node.type === "rule") {
                    callback(node); 
                }
            }
        }
    }

    // Gets the top level HTML selector
    getHtmlSelectorStart(parsedSass) {
        const nodes = parsedSass.nodes;
        const htmlNodes = nodes.filter(node => node.type === "rule" && node.selector === "html");
        return htmlNodes.length ? { nodes: [htmlNodes[htmlNodes.length - 1]] } : null
    }

    // Removes the attribute and text declarations
    removeInvalidDecls(obj) {
        this.loop(obj, node => {
            const invalidDecls = node.nodes.filter(innerNode => innerNode.type === "decl" && (innerNode.prop === "text" || innerNode.prop.charAt(0) === "-"));
            invalidDecls.forEach(decl => decl.remove());
            this.removeInvalidDecls(node);
        });
    }

    // Removes filler declarations
    removeFillers(obj) {
        this.loop(obj, node => {
            const fillerDecls = node.nodes.filter(innerNode => innerNode.type === "decl" && innerNode.prop === "__FILLER__");
            fillerDecls.forEach(decl => decl.remove());
            const splitSelector = node.selector.split(' ');
            const singleSelector = splitSelector[splitSelector.length - 1];
            node.selector = singleSelector;
            this.removeFillers(node);
        });
    }

    // Adds filler declarations for properly parsing with postcss
    fillerDeclForEmptyNodes(obj) {
        this.loop(obj, node => {
            const isEmptyRule = node.nodes.filter(innerNode => innerNode.type === "decl").length === 0;
            if (isEmptyRule) {
                node.append({
                    prop: '__FILLER__',
                    value: '_'
                });
            }
            this.fillerDeclForEmptyNodes(node);
        })
    }

    // Converts a rendered scss string to a valid sass string
    scssToSass(string) {
        return string.replace(/{/g, '').replace(/}/g, '').replace(/;/g, '');
    }

    // Traverses the postcss object and creates an HTML output
    traverse(obj) {
        let contents = "\n";
        this.loop(obj, node => {
            const text = this.getTextDeclaration(node)[0] || '';
            const atts = this.getHtmlAttributes(node);
            const splitSelector = node.selector.split(' ');
            const singleSelector = splitSelector[splitSelector.length - 1];
            contents += this.htmlFromSelector(singleSelector, this.traverse(node), text, atts);
        });
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

    // Removes quotes for text properties
    removeQuotes(value) {
        const firstVal = value.charAt(0);
        const lastVal = value.charAt(value.length - 1);
        if (firstVal === "'" || firstVal === '"') value = value.slice(1);
        if (lastVal === "'" || lastVal === '"') value = value.slice(0, value.length - 1);
        return value;
    }

    // Creates HTML from a selector
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
    async renderSass(sassContents) {
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

module.exports = ZipperMerge;