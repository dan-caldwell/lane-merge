import * as postcss from 'postcss';
import util from 'util';
import fs from 'fs';
import sass from 'node-sass';
import path from 'path';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const readdir = util.promisify(fs.readdir);

const getCssFromSass = async () => {
    const sassContents = await readFile(path.join(__dirname, '../src/index.scss'), "utf8");
    const result = sass.renderSync({
        data: sassContents
    });
    console.log(result.css.toString());
}
getCssFromSass();


class ZipperMerge {

    constructor() {
        
    }


    
}

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