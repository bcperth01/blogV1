import pg_pool from "./connectPool.js";

// Note: This fn is unused and does not add all the necessary fields
// ...canditiate for deletion
export async function addUser(user) {}

export async function deleteUser() {}

export async function updateUser() {}

export async function getUser() {}

// get every record in the users table
export async function getAllUsers() {
  console.log("Getting users")
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
