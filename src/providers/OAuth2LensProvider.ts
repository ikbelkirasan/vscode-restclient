"use strict";

import {
  CancellationToken,
  CodeLens,
  CodeLensProvider,
  Range,
  TextDocument
} from "vscode";
import * as Constants from "../common/constants";
import { Selector } from "../utils/selector";

export class OAuth2LensProvider implements CodeLensProvider {
  public provideCodeLenses(
    document: TextDocument,
    token: CancellationToken
  ): Promise<CodeLens[]> {
    const blocks: CodeLens[] = [];
    const lines: string[] = document
      .getText()
      .split(Constants.LineSplitterRegex);
    const requestRanges: [number, number][] = Selector.getRequestRanges(lines);

    /* tslint:disable no-console */
    /* tslint:disable no-unused-vars */
    for (let [blockStart, blockEnd] of requestRanges) {
      while (blockStart <= blockEnd) {
        const line = lines[blockStart];
        const range = new Range(blockStart, 0, blockEnd, 0);
        let match: RegExpExecArray | null;
        if ((match = /\s*{{\$oauth2\s+([^\s]+)}}/.exec(line))) {
          const variableName = match[1];
          blocks.push(
            new CodeLens(range, {
              arguments: [variableName],
              title: "Get Access Token",
              command: "rest-client.oauth2-get-token"
            })
          );
          blocks.push(
            new CodeLens(range, {
              arguments: [variableName],
              title: "Refresh Token",
              command: "rest-client.oauth2-refresh-token"
            })
          );
        }
        blockStart++;
      }
    }

    return Promise.resolve(blocks);
  }
}
