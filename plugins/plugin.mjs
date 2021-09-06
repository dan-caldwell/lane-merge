import * as postcss from 'postcss';

const css = `
body {
	background: orange;
	div {
    	color: blue;  
  	}
  
  	.h1 {
    	font-size: 1rem;
      	font-family: sans;
        text: Hello world!;
        [title]: My awesome title;
      
      	.h2 {
        	color: green;
      	}
  	}
}

`;

const root = postcss.parse(css, {});

// Get the styles of the declaration
const getStyles = node => 
    node.nodes.filter(node => node.type === "decl" && node.prop !== "text") // Only include declarations, exclude text declarations
    .map(decl => decl.toString() + ";") // Convert declarations to CSS strings
    .join(''); // Join declarations to string

const getText = node => node.nodes.filter(node => node.type === "decl" && node.prop === "text").reverse().map(decl => decl.value);

const getElement = node => {
    if (!node.selector) return 'div';
    const splitSelector = node.selector.split(' ');

}

const traverse = (obj) => {
    let contents = "\n";
    if (obj.nodes) {
        for (const node of obj.nodes) {
            if (node.selector) {
                const styles = getStyles(node);
                const text = getText(node)[0] || '';
                contents += `<div class="${node.selector}" style="${styles}">${text}\n${traverse(node)}</div>\n`;
            }
        }
    }
    return contents;
}

const traverseOutput = traverse(root);
console.log(traverseOutput);