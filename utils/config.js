var vscode = require('vscode');
var fs = require('fs');
var configDir = vscode.workspace.rootPath + "/.vscode";
var configFilename = configDir + "/sync-config.json";

module.exports={
    init: function(log){
        //initial
        var status = '';
        var defaultConfig =  {
            //Whether or not to auto-sync on file save
            "onSave": false,
            //The remote host location (hostname or IP)
            "host": "localhost",
            //The destination path on the remote
            "dest": "/",
            //The destination path on the local path
            "local": ""+vscode.workspace.rootPath,
            //The username to rsync with
            "user": "$(whoami)",
            //The remote port
            "port": 22,
            //Additonal rsync flags to pass
            "flags": "",
            //Whether or not to log additional details to the `Output` console
            "verbose": false,
            //Whether or not to show show errors quietly
            "quiet": false,
            //Whether or not to sync dirty (unsaved) files
            "dirty": false,
            //Files to exclude. If true, defaults to `files.exclude`
            "exclude": ["\\.vscode", "\\.git", "\\.DS_Store"]
            //please reload your workspace to initialize the settings
        };
        if(!vscode.workspace.rootPath) {
            status = "Cannot initilaize in empty workspace.";
            log.warn(status);
            vscode.window.showErrorMessage(status);
        }
        //check .vsode dir is existed
        if(!fs.existsSync(configDir)){
            fs.mkdirSync(configDir);
            log.info("Create local config...");
        }
        //check config file is existed
        if (fs.existsSync(configFilename)){
            status = "Config already existed.";
            vscode.window.showWarningMessage(status, {
                title: 'Edit'
            }).then((ok) => {
                // if they approve
                if (ok) {
                    this.editConfig();
                }
            });
        }else{
            status = "Create new config file";
            log.info(status);
            fs.writeFileSync(configFilename, JSON.stringify(defaultConfig, null, 4));
            this.editConfig();
        }
    },
    getConfig: function(log){
        if(fs.existsSync(configFilename)){
            log.info("test");
            var localConfig = fs.readFileSync(configFilename).toString();
            var configObject;
            try {
                configObject = JSON.parse(localConfig);
                return configObject;
            }
            catch (err){
                log.warning("Config file is not a valid JSON document.");
                vscode.window.showErrorMessage("Config file is not a valid JSON document.:" + err.message);
            }
            return "";
        }else{
            log.warn("cannot get local config");
            vscode.window.showWarningMessage("[Sync] Cannot get local config. Please run 'yo:init' to create your local config file and then reload windows.");
            return "";
        }
    },
    editConfig: function(){
        var configDoc = vscode.workspace.openTextDocument(configFilename);
        configDoc.then(function(document) {
            vscode.window.showTextDocument(document);
        });
    }
}