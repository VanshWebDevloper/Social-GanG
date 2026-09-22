Social GanG app files, how to install in Termux:

1. keep YOUR firebase-config.js in docs/app/js/ (the example file is just a
   template, don't overwrite your real one with it)
2. replace these files with the ones in this zip:
   docs/app/login.html
   docs/app/css/auth.css
   docs/app/js/auth.js
   docs/app/home.html
   docs/app/css/home.css
   docs/app/js/home.js
3. firebase console -> build -> firestore database -> rules tab:
   delete everything, paste the whole contents of firestore.rules, publish
4. firebase console -> build -> authentication -> sign-in method:
   enable Email/Password
   settings -> authorized domains: add vanshwebdevloper.github.io
5. git add . && git commit -m "communities" && git push

how it works:
- signup -> straight to home, no email gate. verification mail still fires
- default community "Hackclubers" with lounge / community / india / help
  creates itself the first time the app runs
- tap a community icon to open it, + to create or join with a code
- invite button copies a link like ...?join=abc123, anyone opening it joins
- community owner gets the gear: rename, re-icon, add/delete channels,
  kick members, delete community
- double-tap the S logo to log out
