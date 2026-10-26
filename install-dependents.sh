#!/bin/sh
npm install
npm run preview-build

cd daemon
npm install
cd ../panel
npm install
cd ../frontend-react
npm install

echo "------------"
echo "All done!"
echo "------------"
