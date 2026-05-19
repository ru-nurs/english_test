require("dotenv").config({ override: true });
const config = require("./src/config");
const { createApp } = require("./src/app");

async function main() {
  const app = await createApp();
  app.listen(config.PORT, () => {
    console.log(`Backend server is running on http://localhost:${config.PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});

