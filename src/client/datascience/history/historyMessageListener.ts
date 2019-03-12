// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import '../../common/extensions';

import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';

import { ILiveShareApi, IWebPanelMessageListener } from '../../common/application/types';
import { Identifiers, LiveShare } from '../constants';
import { HistoryMessages, HistoryRemoteMessages } from './historyTypes';
import { PostOffice } from '../liveshare/postOffice';

// tslint:disable:no-any

// This class listens to messages that come from the local Python Interactive window
export class HistoryMessageListener implements IWebPanelMessageListener {
    private postOffice : PostOffice;
    private disposedCallback : () => void;
    private callback :  (message: string, payload: any) => void;
    private historyMessages : string[] = [];

    constructor(liveShare: ILiveShareApi, callback: (message: string, payload: any) => void, disposed: () => void) {
        this.postOffice = new PostOffice(LiveShare.WebPanelMessageService, liveShare, (api, command, role, args) => this.translateHostArgs(api, role, args));

        // Save our dispose callback so we remove our history window
        this.disposedCallback = disposed;

        // Save our local callback so we can handle the non broadcast case(s)
        this.callback = callback;

        // Remember the list of history messages we registered for
        this.historyMessages = this.getHistoryMessages();

        // We need to register callbacks for all history messages.
        this.historyMessages.forEach(m => {
            this.postOffice.registerCallback(m, (a) => callback(m, a)).ignoreErrors();
        });
    }

    public async dispose() {
        await this.postOffice.dispose();
        this.disposedCallback();
    }

    public onMessage(message: string, payload: any) {
        // We received a message from the local webview. Broadcast it to everybody if it's a remote message
        if (HistoryRemoteMessages.indexOf(message) >= 0) {
            this.postOffice.postCommand(message, payload).ignoreErrors();
        } else {
            // Send to just our local callback.
            this.callback(message, payload);
        }
    }

    private getHistoryMessages() : string [] {
        return Object.keys(HistoryMessages).map(k => (HistoryMessages as any)[k].toString());
    }

    private translateHostArgs(api: vsls.LiveShare | null, role: vsls.Role, args: any[]) {
        // Figure out the true type of the args
        if (api && args && args.length > 0) {
            const trueArg = args[0];

            // See if the trueArg has a 'file' name or not
            if (trueArg) {
                const keys = Object.keys(trueArg);
                keys.forEach(k => {
                    if (k.includes('file')) {
                        if (typeof trueArg[k] === 'string') {
                            // Pull out the string. We need to convert it to a file or vsls uri based on our role
                            const file = trueArg[k].toString();

                            // Skip the empty file
                            if (file !== Identifiers.EmptyFileName) {
                                const uri = role === vsls.Role.Host ? vscode.Uri.file(file) : vscode.Uri.parse(`vsls:${file}`);

                                // Translate this into the other side.
                                trueArg[k] = role === vsls.Role.Host ?
                                    api.convertLocalUriToShared(uri).fsPath :
                                    api.convertSharedUriToLocal(uri).fsPath;
                            }
                        }
                    }
                });
            }
        }
    }
}