const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const SyncMate = require('./SyncMate');
const Logger = require('./Logger');
const p = require('./utils/pluralize');
const throttle = require('./utils/throttle');
const configUtil = require('./utils/config');

let watcher;

exports.activate = function activate(context) {
    // create a logger instance using the output channel
    const log = new Logger(vscode.window.createOutputChannel('yo/Sync'), true);
    log.info('Yo! Sync start...');

    // get workspace directory
    const rootPath = vscode.workspace.rootPath;

    // keep track of whether or not things are paused
    const pausedSources = new Set();
    let allPaused = false;

    //get local config
    var local_config = configUtil.getConfig(log);
    
    if (local_config !== "") {
        // create SyncMate instance
        const config = local_config;
        log.info("Config:"+JSON.stringify(config, null, 2));
        const syncMate = new SyncMate(config, rootPath, log);
    
        function setStatus(message) {
            if (message) {
                vscode.window.setStatusBarMessage(`Yo!Sync: ${message}`, 2000);
            }
        }
    
        // main function for syncing everything via SyncMate instance
        function syncDocuments(documents) {
            // exit if no documents passed in or we're paused all paused
            if (!documents || allPaused) {
                return;
            }
    
            // filter the documents into sources to sync
            const sources = [].concat(documents).filter((document) => {
                // path of the document
                const fsPath = document.uri.fsPath;
    
                // helper function to log why we skipped a source
                function skip(reason) {
                    if (reason) {
                        log.warn(`Skipping ${fsPath} (${reason})`);
                    }
                }
    
                // not a "real" source
                if (document.isUntitled) {
                    return skip();
                }
    
                // not in workspace
                if (!fsPath.startsWith(rootPath)) {
                    return skip(`not in the workspace (${rootPath})`);
                }
    
                // does not exist
                if (!fs.existsSync(fsPath)) {
                    return skip('does not exist');
                }
    
                // paused from syncing, skip
                if (pausedSources.has(fsPath)) {
                    return skip();
                }
    
                // isDirty
                if (document.isDirty) {
                    // if the dirty option is set
                    if (config.dirty) {
                        // ensure the `onSave` handler doesn't also fire
                        pausedSources.add(fsPath);
                        // save the document
                        log.info(`Saving dirty file ${fsPath} (syncmate.dirty)`);
                        // TODO - this might be a race condition
                        //  if `save` doesn't complete by the time we invoke rsync
                        document.save().then(() => {
                            pausedSources.delete(fsPath);
                        });
                    } else {
                        // otherwise, skip it
                        return skip('dirty (unsaved) - set `syncmate.dirty: true` to sync dirty files');
                    }
                }
    
                // if we got here, we want to sync the source
                return true;
            }).map((document) => {
                // map to relative path
                // NOTE: need to use path.relative instead of workspace.asRelativePath
                //  because asRelativePath returns an absolute path for when fsPath == rootPath
                return path.relative(rootPath, document.uri.fsPath) || './'; // ./ for syncProject
            });
    
            // no sources? exit
            if (!sources.length) {
                return;
            }
    
            // self-executing closure so we can retry if needed
            (function trySync() {
                setStatus(`Syncing ${p(sources)}`);
                // start the sync for the given sources
                syncMate.sync(sources).then(() => {
                    // sync finished
                    setStatus(`Completed ${p(sources)}`);
                }, () => {
                    // sync failed
                    setStatus(`Failed`);
                    // if we're not in quiet mode...
                    if (!config.quiet) {
                        // let the user know things didn't work
                        // ask them if they want to retry
                        vscode.window.showErrorMessage(`SyncMate failed to sync all sources to Yahoo!(see Output). Would you like to retry?`, {
                            title: 'Retry'
                        }).then((ok) => {
                            // if yes...
                            if (ok) {
                                // try it again
                                trySync();
                            }
                        })
                    }
                });
            }());
    
            // after all syncs are done...
            syncMate.done().then(() => {
                log.info('All sync tasks finished');
                // wait 1 second
                setTimeout(() => {
                    // then show done
                    setStatus('Done');
                }, 1000);
            });
        }
    
        // sync an entire directory
        function syncDirectory(dir = '') {
            // helper function to wrap the directory as a TextDocument
            function sync() {
                syncDocuments({
                    uri: {
                        fsPath: path.join(rootPath, dir)
                    }
                });
            }
    
            // if syncmate.dirty...
            if (config.dirty) {
                // pause all syncs until we finish saving...
                allPaused = true;
                // save all open files...
                vscode.workspace.saveAll().then(() => {
                    // unpause
                    allPaused = false;
                    // then sync
                    sync();
                });
            } else {
                // otherwise, just sync now
                sync();
            }
        }

        //handle onSave
        if (config.onSave) {
            log.info("Sync onSave...");
            vscode.workspace.onDidSaveTextDocument(syncDocuments, this, context.subscriptions);
        }
        //add event 
        // syncOpenFiles
        context.subscriptions.push(vscode.commands.registerCommand('yo.syncOpenFiles', () => {
            // TODO: this doesn't seem to always grab _all_ "open" files
            syncDocuments(vscode.workspace.textDocuments);
        }));

        // syncProject
        context.subscriptions.push(vscode.commands.registerCommand('yo.syncProject', () => {
            // syncs the entire rootPath
            syncDirectory();
        }));

        // syncDirectory
        context.subscriptions.push(vscode.commands.registerCommand('yo.syncDirectory', () => {
            // prompt for the directory to sync
            vscode.window.showInputBox({
                prompt: `Diretory path to sync (relative to ${rootPath})`
            }).then(syncDirectory);
        }));
    } else {
        //set all action to trigger config
        log.info("empty config ...");
        ['syncOpenFiles', 'syncProject', 'syncDirectory'].forEach((command) => {
            context.subscriptions.push(vscode.commands.registerCommand(`yo.${command}`, () => {
                vscode.window.showWarningMessage("Yo! Cannot find local configuration. Do you want to initialize it?", {
                    title: 'Edit'
                }).then((ok) => {
                    // if they approve
                    if (ok) {
                        vscode.window.showInformationMessage('Awesome! Please restart vscode after you set up the configuration!');
                        configUtil.init(log);
                    }
                });
            }));
        });
    }

    context.subscriptions.push(vscode.commands.registerCommand('yo.init', () => {
        // initialize local config file under workspaceRoot .vscode/rsync-config.json
        configUtil.init(log);
    }));

};

exports.deactivate = function deactivate() {

};
