import {Meteor} from "meteor/meteor";
import shell from "shelljs";
import serveStatic from "serve-static";
import bodyParser from "body-parser";
import {createWriteStream, lstatSync, readdirSync, readFile, readFileSync} from "fs";
import {basename, extname, join} from "path";
import configurationFile from "./config";
const demoMode = Meteor.settings.configuration["demo-mode"];

Meteor.startup(() => {

const {imagesFolder, pointcloudsFolder} = configurationFile;
    WebApp.connectHandlers.use("/file", serveStatic(imagesFolder, {fallthrough: false}));
    WebApp.connectHandlers.use("/datafile", serveStatic(pointcloudsFolder, {fallthrough: true}));
    WebApp.connectHandlers.use("/datafile", (req,res)=>{
        res.end("");
    });

    WebApp.connectHandlers.use(bodyParser.raw({limit: "200mb", type: 'application/octet-stream'}));
    WebApp.connectHandlers.use('/save', function (req, res) {
        if (demoMode) return;
        // req.url is the full path e.g. /save/foo.pcd.labels; strip /save prefix
        const relPath = decodeURIComponent(req.url).replace(/^\/save/, "");
        // join normalises double-slashes that arise when pointcloudsFolder ends with /
        const fileToSave = join(pointcloudsFolder, relPath);
        const dir = fileToSave.match("(.*\/).*")[1];
        shell.mkdir('-p', dir);

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

        const wstream = createWriteStream(fileToSave);
        wstream.on('error', (err) => {
            console.error('[SSE] Cannot write', fileToSave, err.code, err.message);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end('Write error: ' + err.message);
            }
        });
        wstream.write(req.body);
        wstream.end(() => res.end("Sent: " + fileToSave));
    });
});
