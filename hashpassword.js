const bcrypt = require("bcrypt");

async function hashPassword() {
  const password = "admin123";
  const hashedPassword = await bcrypt.hash(password, 10);
  console.log("Copy hash ini:");
  console.log(hashedPassword);
}

hashPassword();
