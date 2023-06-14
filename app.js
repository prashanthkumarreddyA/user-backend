const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const databasePath = path.join(__dirname, "userData.db");

const app = express();
app.use(cors())

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3004, () =>
      console.log("Server Running at http://localhost:3004/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 4;
};

app.post("/register", async (request, response) => {
  const { username, name, password, gender, location,prime } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, name, password, gender, location,prime)
     VALUES
      (
       '${username}',
       '${name}',
       '${hashedPassword}',
       '${gender}',
       '${location}',
       ${prime}  
      );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwt_token = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwt_token });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});



app.put("/change-password", async (request, response) => {
  const { username, oldPassword, newPassword } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      oldPassword,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      if (validatePassword(newPassword)) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updatePasswordQuery = `
          UPDATE
            user
          SET
            password = '${hashedPassword}'
          WHERE
            username = '${username}';`;

        const user = await database.run(updatePasswordQuery);

        response.send("Password updated");
      } else {
        response.status(400);
        response.send("Password is too short");
      }
    } else {
      response.status(400);
      response.send("Invalid current password");
    }
  }
});



app.get("/prime-deals/", authenticateToken, async (request, response) => {
  const getPrimeDealsQuery = `
    SELECT
      *
    FROM
    primedeals;`;
  const primedeals = await database.all(getPrimeDealsQuery);
  response.send({primedeals});
});


app.get("/products/", authenticateToken, async (request, response) => {
    const {  sort_by = "", category = "", title_search = "", rating = "" } = request.query;
    let getProductssQuery = `SELECT * FROM product`;

    // Construct the WHERE clause based on the query parameters
    const conditions = [];

    const categoryMap = {
      "1": "Clothing",
      "2": "Electronics",
      "3": "Appliances",
      "4": "Grocery",
      "5": "Toys"
    };
    
    if (category !== "") {
      const categoryName = categoryMap[category] || ""; // Get the category name from the map
      conditions.push(`category = '${categoryName}'`);
    }
    

    if (title_search !== "") {
      conditions.push(`title LIKE '%${title_search}%'`);
    }

    // Append the rating condition to the WHERE clause based on the rating parameter
    if (rating === "4") {
      conditions.push(`rating > 4`);
    } else if (rating === "3") {
      conditions.push(`rating > 3`);
    } else if (rating === "2") {
      conditions.push(`rating > 2`);
    } else if (rating === "1") {
      conditions.push(`rating > 1`);
    }

    // Append the WHERE clause to the SQL query if there are conditions
    if (conditions.length > 0) {
      const whereClause = conditions.join(" AND ");
      getProductssQuery += ` WHERE ${whereClause}`;
    }

    // Append the ORDER BY clause based on the sort_by parameter
    if (sort_by === "PRICE_HIGH") {
      getProductssQuery += ` ORDER BY price DESC`;
    } else if (sort_by === "PRICE_LOW") {
      getProductssQuery += ` ORDER BY price ASC`;
    }

    // Execute the SQL query
    const products = await database.all(getProductssQuery);
    response.send({ products });
});


app.get("/products/:productId/", authenticateToken, async (request, response) => {
  const { productId } = request.params;
  const getProductQuery = `
    SELECT 
      *
    FROM 
    product 
    WHERE 
    id = ${productId};`;
  const product = await database.get(getProductQuery);
  const category=product.category
  const id=product.id
  const getSimilarProductQuery = `SELECT * FROM product WHERE category = '${category}' AND id <> ${id} LIMIT 3`;
  const products=await database.all(getSimilarProductQuery);
  response.send({product:product,similar_products:products});
});


app.get("/cart", authenticateToken, async (request, response) => {
  const { username } = request;
  const getCartItemsQuery = `
    SELECT 
      product.*, cart.quantity
    FROM 
      cart
    INNER JOIN 
      product ON cart.product_id = product.id
    WHERE 
      cart.username = '${username}';`;

  const cartItems = await database.all(getCartItemsQuery);
  response.send({ cartItems });
});

app.post("/cart/add", authenticateToken, async (request, response) => {
  const { username, productId, quantity } = request.body;

  const checkCartItemQuery = `
    SELECT 
      *
    FROM 
      cart
    WHERE 
      username = '${username}' AND product_id = ${productId};`;

  const existingCartItem = await database.get(checkCartItemQuery);

  if (existingCartItem) {
    // Item already exists in the cart, update the quantity
    const updateQuantityQuery = `
      UPDATE 
        cart
      SET 
        quantity = ${existingCartItem.quantity + quantity}
      WHERE 
        username = '${username}' AND product_id = ${productId};`;

    await database.run(updateQuantityQuery);
    response.send("Item quantity updated in the cart");
  } else {
    // Item doesn't exist in the cart, add it with the quantity
    const addToCartQuery = `
      INSERT INTO 
        cart (username, product_id, quantity)
      VALUES
        ('${username}', ${productId}, ${quantity});`;

    await database.run(addToCartQuery);
    response.send("Item added to the cart");
  }
});

app.delete("/cart/remove", authenticateToken, async (request, response) => {
  const { username, productId } = request.body;

  const removeFromCartQuery = `
    DELETE FROM 
      cart
    WHERE 
      username = '${username}' AND product_id = ${productId};`;

  await database.run(removeFromCartQuery);
  response.send("Item removed from the cart");
});

app.put("/cart/update", authenticateToken, async (request, response) => {
  const { username, productId, quantity } = request.body;

  const updateQuantityQuery = `
    UPDATE 
      cart
    SET 
      quantity = ${quantity}
    WHERE 
      username = '${username}' AND product_id = ${productId};`;

  await database.run(updateQuantityQuery);
  response.send("Item quantity updated in the cart");
});
