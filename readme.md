# Zipper Merge

This is a library for turning one stylesheet into HTML and CSS. Merge your CSS and HTML into one file for a simpler markup writing experience.

## Getting started

1. Create an index.scss file in /src
2. Add your SCSS. For the SCSS to be transformed, you must have a top level "html" selector with all your markup inside
3. Run ```npm run dev``` to run the Express server and watch for changes
4. Go to localhost:8000 to view your markup

## Use the zipperMerge function

zipperMerge is an async function that takes an inputPath and an outputFolder

```await zipperMerge(path.join(__basedir, './src/index.scss'), './build');```

## API

- Create an element

To create an element, create a selector

```h2 {
    color: blue;
}```

If you don't have an element at the start and just use a class or ID selector, the element will be a div.

```.example {
    text: "This element is a div";
}```

- Add text to the element

You can add text with the "text" property. Make sure to put your text between quotes.

- Add an attribute

You can add an attribute to your element by starting your property with a hyphen (-).

```a.example {
    -href: "https://google.com";
}```