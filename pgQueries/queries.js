import pg_pool from "./connectPool.js";

export async function addUser(user) {
  console.log("user", user);
  try {
    let result = await pg_pool.query(
      `INSERT INTO users (first_name, last_name,email, member_type)\
            VALUES ('${user.firstName}', '${user.lastName}', '${user.email}','${user.memberType}')`
    );
    return result;
  } catch (error) {
    console.log("error inserting user", error.message);
    return "error inserting user";
  }
}

export async function deleteUser() {}

export async function updateUser() {}

export async function getUser() {}

// get every record in the users table
export async function getAllUsers() {
  try {
    let response = await pg_pool.query(`Select * from  users`);
    return response.rows;
  } catch (error) {
    console.log("error getting all users", error.message);
    return "error getting all users";
  }
}

export async function addArticle(article) {
  console.log("article", article);
  try {
    let result = await pg_pool.query(
      `INSERT INTO articles (title, description, markdown, slug, user_id, published,tag_list)\
            VALUES ('${article.title}', '${article.description}','${article.markdown}',\
                    '${article.slug}','${article.user_id}','${article.published}','${article.tag_list}')`
    );
    return result;
  } catch (error) {
    console.log("error inserting article", error.message);
    return "error inserting article";
  }
}

export async function deleteArticle() {}

export async function updateArticle() {}

export async function getArticle() {}

export async function getAllArticles() {}

export async function getAllArticlesByUser() {}

export async function addComment() {}

export async function deleteComment() {}

export async function updateComment() {}

export async function getComment() {}

export async function getAllComments() {}
