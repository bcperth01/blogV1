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

Routes are:

1.  `/` **GET** Reads all articles and renders them with the **index** template
2.  `/articles/` **POST** Saves a new article, parses the markdown and renders the **Edit**template
3.  `/articles/:id` **PUT** Saves an existing article, then parses the markdown and renders the **Edit** template
4.  `/articles/:id` **DELETE** Deletes an article by id, the redirect to Home ("/")
5.  `/articles/:slug` **GET** Finds an article by its slug, parses the markdown and renders the **Show**template
6.  `/articles/new` **GET** Creates a new blank article and renders the **New**template
7.  `/articles/edit/:slug` **GET** Locate an article by slug, parses the markdown and renders the **Edit** template

## EJS Template Files

There are four **ejs** template files, all located in `/view/articles/` directory. They are:

1. **index.ejs** Display all articles.\
   `New Article` button redirects to `/articles/new` **GET**\
   In each displayed article\
    `Read More..` button redirects to `/articles/:slug` **GET**\
   `Edit` button redirects to `/articles/edit/:slug` **GET**\
   `Delete` button redirects to `/articles/:id` **DELETE**\
2. **edit.ejs** Display 2 panes: Edit Form for an existing article and a Preview of the markup
   The `edit` template imports the `_form_fields` partial template\
   The form is submitted to `/articles/:id` **PUT**\
    `_form_fields` has:\
    `Save` button of `type submit` which submits the form as above\
    ``Exit without Save` button which redirects to `/` **GET**\
3. **new.ejs** Display edit form for a new article \
   The `new` template imports the `_form_fields` partial template\
   The form is submitted to `/articles/` **POST**\
    `_form_fields` has:\
    `Save` button of `type submit` which submits the form as above \
    `Exit without Save` button which redirects to `/` **GET**\
4. **show.ejs** displays one article\
   `All Articles` button redirects to `/` **GET**\
   `Edit` button rediects to `/articles/edit/:slug` **GET**

## Workflows

1. **Display all articles**: Either navigate in the browser to `"/"` or press the `All Articles` button in the `/articles/:slug` route
2. **Add a new article**: Press the `New Article` in the `"/"` screen
3. **Edit an existing Article** Press the `More details...` button on the home page for the article you want to change. Then press `Edit `button. Make the changes and press `Save`
4. **Delete an existing Article** Press the `Delete` button on the home page for the article you want to delete.

## Version 2 Changes

1. Add a user login so that only admin users can create, edit or delete posts
2. **(Done)**Change to using `markdown-it` library rather than `marked` .... its more active and current.
3. **(Done)**Add code highlighting - using the highlight.js package.
4. Change the db to Postgres and\
   add full text search.
5. Allow visitors to add comments to posts
6. **(Done)** Add a nav bar with a Home Page and About Page
7. Make the site responsive (maybe)
8. Figure out how to deploy and do it
9. **(Done)** Remove sanitiseHTML attribute from the model - ie no longer to be in the Mongo table\
   Instead calculate it on the fly for the "show" template.
10. Add a `publish` status/workflow so that only published blogs can be seen by visitors
11. Make sure it has appriate SEO elements
12. **(Done)** Remove the "validate" middleware from the model and create the slug and sanitisedHtml in the route as needed.
    **(Done)** Remove the middleware implementation of the save function for both new and update API's - it was hard to understand
13. **(Done)** Split the screen when displaying the edit template to allow a preview of the markup being entered
14. **(Done)**Stop the Previw pane from growing in width ffor long text lines
