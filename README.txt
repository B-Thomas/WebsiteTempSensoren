INDOOR CLIMATE SENSOR DASHBOARD
================================

CONTENTS
- index.html              Overview of all rooms, live chart for the last 24 hours
- room.html               Historical report for one room
- styles.css              Layout and responsive design
- app.js                  Data loading and charts
- config.js.example       Frontend configuration; copy to config.js before use
- cgi-bin/config.example.php  Server configuration; copy to cgi-bin/config.php before use
- api_get_room_list.php   Room list
- api_combined.php        Read endpoint for raw and aggregated readings
- LICENSE                 MIT License

INSTALLATION
1. Copy the files into a directory on the web server, for example /var/www/html/sensors/.
2. Copy config.js.example to config.js.
3. Set the API URLs, secret, and API key in config.js.
4. Copy cgi-bin/config.example.php to cgi-bin/config.php.
5. In cgi-bin/config.php, set the database, secret, API key, and table and column names.
   api_secret and api_key must match secret and key in config.js.
6. In cgi-bin/.htaccess, set AuthUserFile to the absolute path of the password file,
   or remove the Basic Auth lines if directory protection is not wanted.
7. The PHP extensions mysqli and mysqlnd (for get_result) must be installed.
8. Open index.html in a browser.

DATABASE ASSUMPTIONS
Table and column names live only in cgi-bin/config.php.
The scripts expect one readings table and one rooms table. The time column must be a
MySQL DATETIME or TIMESTAMP. The source column of the readings must match the source
column of the rooms table. API JSON field names stay fixed (timestamp, temperature,
humidity, AvgTemp, AvgHum, and so on), regardless of the column names in the database.

API NOTES / SECURITY
- The dashboard reads measurements only with access=READ. It has no write function.
- config.js is delivered to the browser, so a secret stored there is not a lasting
  secret. On a publicly reachable server, protect the endpoint with authentication,
  an IP restriction, or a server-side session, and do not set CORS to * for everyone.
- The included api_combined.php is a read-only dashboard version. If an existing
  script also handles sensor writes, do not replace it blindly: integrate the read
  handler, or use a separate read-only endpoint.
- Chart.js and Google Fonts are loaded from a CDN, so the browser needs internet
  access. For a fully offline installation, host the libraries locally and update
  the references.

IMPORTANT
config.js and cgi-bin/config.php are listed in .gitignore. Publish only the example
files. Real credentials, secrets, and the password-file path do not belong in the
repository.

LICENSE
MIT License. The full text is in LICENSE.
