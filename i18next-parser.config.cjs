// i18next-parser.config.js
module.exports = {
  locales: ['en', 'zh'], // The languages you want to support
  output: 'src/locales/$LOCALE.json', // Where the auto-generated files will go
  input: ['src/**/*.{js,jsx,ts,tsx}'], // Scan all React files
  sort: true, // Keep the JSON alphabetically sorted
  createOldCatalogs: false, // Don't keep backups of old JSONs
  keySeparator: false, // Allow spaces in keys (e.g., t("Hello World"))
  namespaceSeparator: false // Use a single flat JSON file
};