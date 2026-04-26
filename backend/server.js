require("dotenv").config();
const config = require("./src/config");
const { createApp } = require("./src/app");

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`Backend server is running on http://localhost:${config.PORT}`);
});
