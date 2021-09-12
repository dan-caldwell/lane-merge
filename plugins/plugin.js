const postcss = require('postcss');
const util = require('util');
const fs = require('fs');
const sass = require('sass');
const path = require('path');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const readdir = util.promisify(fs.readdir);

const getCssFromSass = async () => {
    const sassContents = await readFile(path.join(__dirname, '../src/index.scss'), "utf8");
    const result = sass.renderSync({
        data: sassContents,
    });
    //console.log(result.css.toString());
}


class ZipperMerge {
    inputPath = "../src";

    constructor() {
        this.init();
    }

    async init() {
        //const css = await this.getCssFromSass();
        const sassObj = await this.getSass();
        const rules = this.getListOfAllRules(sassObj);
        const selectors = this.mapRules(rules);
        const renderedSass = await this.renderSass();
        const renderedSassObj = this.parseRenderedSass(renderedSass);
        const formattedSelectorArray = this.addNodesToSelectorsArray(selectors, renderedSassObj);
        const tree = this.createTreeFromFlatArray(formattedSelectorArray);
        const objTree = {
            node: {
                childNodes: tree
            }
        }
        const output = this.traverse(objTree);
        console.log(output);
        //console.dir(tree, { depth: null});
    }

    traverse(obj) {
        let contents = "\n";
        if (obj.node.childNodes) {
            for (const node of obj.node.childNodes) {
                const text = this.getTextDeclaration(node.node)[0] || '';
                contents += this.htmlFromSelector(node.selector, this.traverse(node), text);
            }
        }
        return contents;
    }

    getTextDeclaration = (node) =>
        node.nodes
            .filter(node => node.type === "decl" && node.prop === "text")
            .reverse().map((decl) => {
                const firstVal = decl.value.charAt(0);
                const lastVal = decl.value.charAt(decl.value.length - 1);
                if (firstVal === "'" || firstVal === '"') decl.value = decl.value.slice(1);
                if (lastVal === "'" || lastVal === '"') decl.value = decl.value.slice(0, decl.value.length - 1);
                return decl.value;
            });

    createTreeFromFlatArray(dataset) {
        const hashTable = Object.create(null);
        dataset.forEach(aData => {
            hashTable[aData.renderedSelector] = { ...aData };
            hashTable[aData.renderedSelector].node.childNodes = [];
            delete hashTable[aData.renderedSelector].node.parent;
            delete hashTable[aData.renderedSelector].node.source;
        });
        const dataTree = [];
        dataset.forEach(aData => {
            if (aData.parent) {
                hashTable[aData.parent].node.childNodes.push(hashTable[aData.renderedSelector]);
            } else {
                dataTree.push(hashTable[aData.renderedSelector]);
            }
        });
        return dataTree;
    }

    htmlFromSelector(selector, traversal, innerText = "") {
        if (selector.startsWith('#') || selector.startsWith('.')) selector = 'div' + selector;
        const arr = [
            [/#([\w-]+)/, ` id="$1"`],
            [/((\.[\w-]+)+)/, (_, c) => ` class="${c.split`.`.join` `.trim()}"`],
            [/(\[.+?\])/g, (_, a) => " " + a.slice(1, -1)],
            [/([\S]+)(.*)/, `<$1$2>${innerText}${traversal}</$1>`]
        ].map((replacement) => {
            const regex = replacement[0];
            const str = replacement[1];
            selector = selector.replace(regex, str);
            return selector;
        }
        )[3];
        return arr;
    }

    addNodesToSelectorsArray(selectorsArray, nodesArray) {
        return selectorsArray.map(selector => {
            const foundNode = nodesArray.find(node => node.selector === selector.renderedSelector);
            selector.node = foundNode;
            return selector;
        }).filter(selector => selector.node);
    }

    // Map rules to selectors to easily traverse
    mapRules(rules) {
        return rules.map(rule => {
            const { renderedSelector, selector, parentId } = rule;
            const children = rule.nodes.filter((node) => node.type === "rule").map((child) => child.renderedSelector);
            return {
                renderedSelector, selector, parent: parentId || null, children
            }
        });
    }

    // Parse rendered Sass
    parseRenderedSass(contents) {
        const data = postcss.parse(contents, {});
        return data.nodes || [];
    }

    // Render SCSS file
    async renderSass() {
        const sassContents = await readFile(path.join(__dirname, '../src/index.scss'), "utf8");
        const result = sass.renderSync({
            data: sassContents,
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

    async getSass() {
        const filePaths = await this.getAllFilePaths(path.join(__dirname, this.inputPath), null);
        return await this.createObjFromFiles(filePaths);
    }

    // Read raw SCSS file paths and create an output object based on files
    async createObjFromFiles(filePaths) {
        let dataObjects = [];
        for (const filePath of filePaths) {
            try {
                const contents = await readFile(filePath);
                const data = postcss.parse(contents, {});
                const rules = data.nodes.filter(node => node.type === "rule");
                if (rules.length) dataObjects = dataObjects.concat(rules);
            } catch (err) {
                console.error('Error reading file', err);
            }
        }
        return Object.assign(dataObjects);
    }

    getListOfAllRules(sassObj) {
        let output = [];
        for (const rule of sassObj) {
            const filteredRules = rule.nodes.filter((node) => node.type === "rule");
            filteredRules.forEach((filteredRule) => {
                this.getParent(filteredRule);
                filteredRule.renderedSelector = filteredRule.parentId + " " + filteredRule.selector;
            });
            output = output.concat(this.getListOfAllRules(filteredRules));
            // Get the parent and renderedSelector
            this.getParent(rule);
            rule.renderedSelector = rule.parentId ? rule.parentId + " " + rule.selector : rule.selector;
            output = output.concat(rule);
        }
        return output;
    }

    async getCssFromSass() {
        const sassContents = await readFile(path.join(__dirname, this.inputPath), "utf8");
        const result = sass.renderSync({
            data: sassContents,
            outputStyle: 'expanded'
        });
        return result.css.toString();
    }

    async createHtmlOutput() {

    }

    // Get list of selectors from CSS rules
    getSelectors(obj, outputType) {
        let contents = "\n";
        if (obj.nodes) {
            for (const node of obj.nodes) {
                if (node.type === "rule") {
                    const nodeRef = node;
                    if (node.parent?.type === "rule") {
                        const parentNode = node.parent;
                        const parent = parentNode.selector || "";
                        nodeRef.parentId = parentNode.parentId ? parentNode.parentId + ' ' + parent : parent;
                    }
                    const style = getStyles(node, true);
                    //contents += `${nodeRef.parentId || ''} ${node.selector} {\n\t${style}\n}`;
                    //contents += this.getSelectors(node, outputType);
                }
            }
        }
        return contents;
    }

    getParent(node) {
        if (node.parent?.type === "rule") {
            const parentNode = node.parent;
            const parent = parentNode.selector || "";
            node.parentId = parentNode.parentId ? parentNode.parentId + ' ' + parent : parent;
        }
    }

}

new ZipperMerge();

const css = `
body {
	background: orange;
	div.blue {
    	color: blue;  
  	}
  
  	.h1.my-awesome-class {
    	font-size: 1rem;
      	font-family: sans;
        text: Hello world!;
        [title]: My awesome title;
      
      	small.h2 {
        	color: green;
      	}
  	}
}


`;

// Create HTML based on the selector
const htmlFromSelector = (selector, traversal, innerText = "") => {
    if (selector.startsWith('#') || selector.startsWith('.')) selector = 'div' + selector;
    const arr = [
        [/#([\w-]+)/, ` id="$1"`],
        [/((\.[\w-]+)+)/, (_, c) => ` class="${c.split`.`.join` `.trim()}"`],
        [/(\[.+?\])/g, (_, a) => " " + a.slice(1, -1)],
        [/([\S]+)(.*)/, `<$1$2>${innerText}${traversal}</$1>`]
    ].map((replacement) => {
        const regex = replacement[0];
        const str = replacement[1];
        selector = selector.replace(regex, str);
        return selector;
    }
    )[3];
    return arr;
}
const root = postcss.parse(css, {});

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

const getTextDeclaration = (node) =>
    node.nodes
        .filter(node => node.type === "decl" && node.prop === "text")
        .reverse().map((decl) => decl.value);

const traverse = (obj, outputType) => {
    let contents = "\n";
    if (obj.nodes) {
        for (const node of obj.nodes) {
            switch (outputType) {
                case 'html':
                    if (node.type === "rule") {
                        const text = getTextDeclaration(node)[0] || '';
                        contents += htmlFromSelector(node.selector, traverse(node, outputType), text);
                    }
                    break;
                case 'css':
                    if (node.type === "rule") {
                        const nodeRef = node;
                        if (node.parent?.type === "rule") {
                            const parentNode = node.parent;
                            const parent = parentNode.selector || "";
                            nodeRef.parentId = parentNode.parentId ? parentNode.parentId + ' ' + parent : parent;
                        }
                        const style = getStyles(node, true);
                        contents += `${nodeRef.parentId || ''} ${node.selector} {\n\t${style}\n}`;
                        contents += traverse(node, outputType);
                    }
                    break;
            }
        }
    }
    return contents;
}

const htmlOutput = traverse(root, 'html');
const cssOutput = traverse(root, 'css');
//console.log(cssOutput);