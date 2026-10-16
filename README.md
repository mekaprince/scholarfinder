# ScholarFind (vanilla HTML/CSS/JS + Netlify Functions + Neon)
1. Neon: create a free project, run db/schema.sql in the SQL editor, copy the connection string.
2. GitHub: push this folder. Netlify: "Import from Git"..
3. Netlify > Site settings > Environment variables: DATABASE_URL (Neon string), JWT_SECRET (any 32+ random characters).
4. Make yourself admin after registering: update users set is_admin=true where email='you@example.com';
