import * as postcss from 'postcss';
import util from 'util';
import fs from 'fs';
import sass, { render } from 'sass';
import path from 'path';

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
    inputPath: string = "../src";

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
        console.log(selectors);
    }

    // Map rules to selectors to easily traverse
    mapRules(rules: any[]) {
        return rules.map(rule => {
            const { renderedSelector, selector } = rule;
            //console.log(rule);
            return {
                renderedSelector, selector
            }
        });
    }

    // Parse rendered Sass
    parseRenderedSass(contents: string) {
        const data: postcss.Root = postcss.parse(contents, {});
        return data;
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
    async getAllFilePaths(dirPath: string, arrayOfFiles: string[] | null): Promise<string[]> {
        let files: string[] = [];
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
    async createObjFromFiles(filePaths: string[]) {
        let dataObjects: postcss.ChildNode[] = [];
        for (const filePath of filePaths) {
            try {
                const contents = await readFile(filePath);
                const data: postcss.Root = postcss.parse(contents, {});
                const rules = data.nodes.filter(node => node.type === "rule");
                if (rules.length) dataObjects = dataObjects.concat(rules);
            } catch (err) {
                console.error('Error reading file', err);
            }
        }
        return Object.assign(dataObjects);
    }

    getListOfAllRules(sassObj: any) {
        let output: any[] = [];
        for (const rule of sassObj) {
            const filteredRules = rule.nodes.filter((node: postcss.Rule) => node.type === "rule");
            filteredRules.forEach((filteredRule: any) => {
                this.getParent(filteredRule);
                filteredRule.renderedSelector = filteredRule.parentId + " " + filteredRule.selector;
            });
            output = output.concat(this.getListOfAllRules(filteredRules as postcss.Rule[]));
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
    getSelectors(obj: postcss.Rule | postcss.Root, outputType: 'html' | 'css') {
        let contents = "\n";
        if (obj.nodes) {
            for (const node of obj.nodes) {
                if (node.type === "rule") {
                    const nodeRef: any = node;
                    if (node.parent?.type === "rule") {
                        const parentNode: any = node.parent;
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

    getParent(node: any) {
        if (node.parent?.type === "rule") {
            const parentNode: any = node.parent;
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
const htmlFromSelector = (selector: string, traversal: string, innerText: string = "") => {
    if (selector.startsWith('#') || selector.startsWith('.')) selector = 'div' + selector;
    const arr = [
        [/#([\w-]+)/,` id="$1"`],
        [/((\.[\w-]+)+)/,(_: string, c: any)=>` class="${c.split`.`.join` `.trim()}"`],
        [/(\[.+?\])/g,(_: string, a: any)=>" "+a.slice(1,-1)],
        [/([\S]+)(.*)/,`<$1$2>${innerText}${traversal}</$1>`]
    ].map((replacement: any[]) => {
        const regex: RegExp = replacement[0];
        const str: string = replacement[1];
        selector = selector.replace(regex, str);
        return selector;
    }
    )[3];
    return arr;
}
const root: postcss.Root = postcss.parse(css, {});

// Get the styles of the declaration
const getStyles = (node: postcss.Rule, filterInvalidDecls: boolean): string => 
    node.nodes
    .filter((node: any) => {
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

const getTextDeclaration = (node: postcss.Rule) => 
    node.nodes
    .filter(node => node.type === "decl" && node.prop === "text")
    .reverse().map((decl: any) => decl.value);

const traverse = (obj: postcss.Rule | postcss.Root, outputType: 'html' | 'css') => {
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
                        const nodeRef: any = node;
                        if (node.parent?.type === "rule") {
                            const parentNode: any = node.parent;
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