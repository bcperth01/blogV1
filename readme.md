# Blog Site (v1)

This is a very basic blog site that allows a user to enter and edit blog posts in Markdown. All CRUD operations are supported. The articles are saved in a database, and they are displayed in formatted HTML.

I think it needs to be improved before its safe and reasonable to deploy. [See Version 2 below.](#Version-2-Changes)

## How to Start the App

1. Use Docker-desktop to start the `mongoBlog` container. This will expose the mongoDB API at `port 27017`
2. Start MongoDB Compass and connect to verify that MongoDB is working. You should see a database called `blog` and a collection called `articles`
3. Navigate to `/Documents/my-blog2` in `vscode` and enter `npm run devStart`
4. Go to the browser and navigate to `/localhost/5001`

## How the App Works (v1)

It's a 100% Express Server web server. It talks to a MongoDB server that's running in a container. It also use the **ejs** template engine.

It based closely on this tutorial. [How To Build A Markdown Blog Using Node.js, Express, And MongoDB](https://www.youtube.com/watch?v=1NrHkjlWVhM) by "Web Dev Simplified"

The server has only one top level route `"/"` that reads all of the articles (blog posts) and renders them using and **ejs** template file at `views/artcicles/index.ejs`.

The server has multiple sub routes under `/articles`.
These are

1. `/articles/` **POST** to save a new article
2. `/articles/:id` **PUT** to save an edited article by id
3. `/articles/:id` **DELETE** to delete an article by id
4. `/articles/:slug` **GET** to find and display an article by its slug (slugified title)
5. `/articles/new` **GET** render a from to enter a new article
6. `/articles/edit/:slug` **GET** Locate an article by slug and display in the edit form

## EJS Template Files

There are four **ejs** template files, all located in `/view/articles/` directory. They are:

1. `index.ejs` display all articles, first read them from MongoDB
2. `edit.ejs` edit form for an existing article - form is submited to route `/articles/` **POST**
3. `new.ejs` edit form for a new article - form is submitted to route `/articles/:id` **PUT**
4. `show.ejs` display of one article

## Workflows

1. **Display all articles**: Either navigate in the browser to `"/"` or press the `All Articles` button in the `/articles/:slug` route
2. **Add a new article**: Press the `New Article` in the `"/"` screen
3. **Edit an existing Article** Press the `More details...` button on the home page for the article you want to change. Then press `Edit `button. Make the changes and press `Save`
4. **Delete an existing Article** Press the `Delete` button on the home page for the article you want to delete.

## Version 2 Changes

1. Add a user login so that only admin users can create, edit or delete posts
2. Change to using `markdown-it` library rather than `marked` .... its more active and current.
3. Add code highlighting - using the highlight.js package.
4. Change the db to Ingres and add full text search.
5. Allow visitors to add comments to posts
6. Add a nav bar with a Home Page and About Page
7. Make the site responsive (maybe)
8. Figure out how to deploy and do it
9. Stop saving the HTML in the database, instead use mardown-it to generate it on the fly
10. Add a `publish` status/workflow so that only published blogs can be seen by visitors
11. Make sure it has appriate SEO elements
