# Note on starting Postgres in Docker

The first time you load Postgres it needs some passwords etc. You need to use the CLI

`docker run --name postgres -e POSTGRES_PASSWORD=password -e POSTGRES_USER=postgres -p 5432:5432 -d postgress

You can start and stop the container via Docker desktop

# Notes on initially populating the tables in Postgres
1. Use PGAdmin to create a new database called `express-crud`
2. Create a `.env` file with the desired database name, user and password.
   When HTTP server is started, a connection pool is created using the `.env` parameters 
3. When the serve is up, run `localhost:5001/testPG` route to verify that postgres is alive and also
   returns the name of the current database ()
4. The `/` route is routed to `/home` which itself is implemented as a document that has to be
   retrieved from the database. If the page does not exist, then some instructions are provided
   how to create it - basically create a new `.md` document with a slug called `home-page`. The route will find it after that. You may have to poke in the slug value after the document has been saved
5. The same applies to the `/about` route. That needs a document with a slug called `about-page`
    
# Notes on backing up an restoring the Postgres database 
1. When this is working the above initialisation of the `/home` and `/about` pages will not be needed
2. For now we will use the `backup` and `restore` commands from within PGAdmin
3. TOTO - test the `backup` and `restore` commands from within PGAdmin

# Blog Site (v1)

This is a very basic blog site that allows a user to enter and edit blog posts in Markdown. All CRUD operations are supported. The articles are saved in a database, and they are displayed in formatted HTML.

I think it needs to be improved before its safe and reasonable to deploy. [See Version 2 below.](#Version-2-Changes)

## How to Start the App

1. (NO LONGER VALID) Use Docker-desktop to start the `mongoBlog` container. This will expose the mongoDB API at `port 27017`
2. (NO LONGER VALID) Start MongoDB Compass and connect to verify that MongoDB is working. You should see a database called `blog` and a collection called `articles`
3. Use Docker-desktop to start the "postgres`container. This will expose the mongoDB API at`port 27017`
4. PgAmdin can be used to inspect the data
5. Navigate to `/Documents/my-blog2` in `vscode` and enter `npm run devStart`
6. Go to the browser and navigate to `/localhost/5001`

## How the App Works (v1)

It's a 100% Express Server web server. It talks to a Postgres server that's running in a container. It also use the **ejs** template engine.

It based closely on this tutorial. [How To Build A Markdown Blog Using Node.js, Express, And MongoDB](https://www.youtube.com/watch?v=1NrHkjlWVhM) by "Web Dev Simplified"
The navbar is based on these bootstrap instructions [Navbar](https://getbootstrap.com/docs/5.3/components/navbar/)
This tutorial gives an in-depth on authorisation with passport [User Authentication in Web Apps (Passport.js, Node, Express)](https://www.youtube.com/watch?v=F-sFp_AvHc8&t=6384s)

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

1. Add a user login so that only users can create, edit or delete posts
2. **(Done)**Change to using `markdown-it` library rather than `marked` .... its more active and current.
3. **(Done)**Add code highlighting - using the highlight.js package.
4. **(Done)**Change the db to Postgres and
   **TODO** add full text search.
5. Allow visitors to add comments to posts
6. **(Done)** Add a nav bar with a Home Page and About Page
7. Make the site responsive (maybe)
8. Figure out how to deploy and do it
9. **(Done)** Remove sanitiseHTML attribute from the model - ie no longer to be in the Mongo table
   Instead calculate it on the fly for the "show" template.
10. Add a `publish` status/workflow so that only published blogs can be seen by visitors
11. Make sure it has appropriate SEO elements
12. **(Done)** Remove the "validate" middleware from the model and create the slug and sanitisedHtml in the route as needed.
    **(Done)** Remove the middleware implementation of the save function for both new and update API's - it was hard to understand
13. **(Done)** Split the screen when displaying the edit template to allow a preview of the markup being entered
14. **(Done)**Stop the Previw pane from growing in width ffor long text lines

## Item 4 in Detail - Switch over to Postgres

The reason is to gain access to Postgres full search text capabilities.
We will not use an ORM to see how complicated things are with an "all SQL"
solution - althought - an advantage of ORMS is that they go a long way to preventing
SQL injection attacks supposedly. 
We will assess the benefits of later adopting an ORM - like Sequelise
The model is also extended to include 3 tables: users, articles and comments
A user can have many articles 1:N
A user can have many comments 1:N
An article can have many comments 1:N

1. **(Done)** Set up an postgres container
2. **(Done)** Install PGAdmin, connect to postgres and test out some queries
3. **(Done)** Install the pg node library and set up a connection to postgres
4. **(Done)** Create and test routes to create/destroy the 3 tables and their relationships to enforce referential integrity - ie child records must point to valid parents.
5. **(In Progress)** Create queries to add records to each of the three tables taking into account the foreign key references.
6. **In Progress** Change all routes to use Postgres for all CRUD operations on Articles (Insert, Select, Update, Delete)\
   todo - the INSERT route for a new article
7. **(In Progress)** Add an error page
8. Update all routes to use the error page
9. Add an unauthorised page
10. Update non public routes to use the unauthorised page

## Item 1 in Detail - add user authentication (ref youtube https://www.youtube.com/watch?v=F-sFp_AvHc8)

1. **(Done)** Set up passport for local user/password registration and login\
   **In Progress** Make nice registration and login forms, and add navigation items
2. Optionally add a JWT strategy
3. Optionally add Google/Github strategies
4. **Done** Update the new article route to include the user id of the logged in user.
5. Implement the publish route and factor published = true into the list articles route.
   add publishReq to articles
   Also list articles newest to oldest.
6. Allow admins only to delete an article
7. allow admins and the owner to edit an article.
8. **Done** Create the Home and About pages (as markdown articles)
9. Make the article list into cards
10. Add admin route to manage articles
11. Add admin route to manage users
