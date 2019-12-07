"use strict";

import axios from "axios";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as qs from "querystring";
import { workspace } from "vscode";

const oauth2UtilityPath =
  "/home/ikbel/tmp/my_utilities/oauth2/dist/oauth2-1.0.0.AppImage"; // TODO: read from settings

const readJson = filePath => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (error, data) => {
      if (error) {
        return reject(error);
      }
      return resolve(JSON.parse(data));
    });
  });
};

const saveJson = (filePath: string, data: object) => {
  return new Promise((resolve, reject) => {
    const str = JSON.stringify(data, null, 2);
    fs.writeFile(filePath, str, error => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
};

const tokenRequest = async (config, data) => {
  const header = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (config.useBasicAuthorizationHeader) {
    (header as any).Authorization =
      "Basic " +
      Buffer.from(config.clientId + ":" + config.clientSecret).toString(
        "base64"
      );
  } else {
    Object.assign(data, {
      client_id: config.clientId,
      client_secret: config.clientSecret
    });
  }

  const res = await axios({
    method: "POST",
    url: config.tokenUrl,
    headers: header,
    data: qs.stringify(data)
  });

  return res.data;
};

async function readProviderConfig(providerName: string) {
  if (!workspace.workspaceFolders) {
    throw new Error("No workspace folder is open");
  }
  const filePath = path.join(
    workspace.workspaceFolders[0].uri.fsPath as string,
    ".rest-client/oauth2/providers/",
    `${providerName}.json`
  );
  return readJson(filePath);
}

async function saveTokens(providerName: string, tokens: object) {
  if (!workspace.workspaceFolders) {
    throw new Error("No workspace folder is open");
  }
  const filePath = path.join(
    workspace.workspaceFolders[0].uri.fsPath as string,
    ".rest-client/oauth2/tokens/",
    `${providerName}.json`
  );

  return saveJson(filePath, tokens);
}

/* tslint:disable no-console */
export class OAuth2Controller {
  public static async readTokens(providerName: string) {
    if (!workspace.workspaceFolders) {
      throw new Error("No workspace folder is open");
    }
    const filePath = path.join(
      workspace.workspaceFolders[0].uri.fsPath as string,
      ".rest-client/oauth2/tokens/",
      `${providerName}.json`
    );

    return readJson(filePath);
  }

  public static async readConfig(providerName: string) {
    if (!workspace.workspaceFolders) {
      throw new Error("No workspace folder is open");
    }
    const filePath = path.join(
      workspace.workspaceFolders[0].uri.fsPath as string,
      ".rest-client/oauth2/providers/",
      `${providerName}.json`
    );

    return readJson(filePath);
  }

  public static async refreshToken(providerName: string) {
    const config = await this.readConfig(providerName);
    const tokens = (await this.readTokens(providerName)) as any;
    const { access_token: accessToken } = (await tokenRequest(config, {
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
      redirect_uri: (config as any).redirectUri
    })) as any;
    tokens.access_token = accessToken;
    await saveTokens(providerName, tokens);
  }

  public static async getAccessToken(providerName: string) {
    return new Promise((resolve, reject) => {
      try {
        let started = false;
        const lines: string[] = [];

        const pEnv = JSON.parse(JSON.stringify(process.env));
        delete pEnv.ATOM_SHELL_INTERNAL_RUN_AS_NODE;
        delete pEnv.ELECTRON_RUN_AS_NODE;
        const p = spawn(oauth2UtilityPath, [], {
          env: pEnv,
          detached: true
        });

        p.stdout.on("data", async chunk => {
          const line = chunk.toString();
          line.trim();

          if (!started) {
            if (line.trim() === "ready") {
              started = true;
              const config = await readProviderConfig(providerName);
              const oauth2Config = JSON.stringify(config);
              p.stdin.write(`${oauth2Config}\r\n`);
              return;
            }
          }

          lines.push(line);
        });

        p.stdout.on("end", async () => {
          const tokens = JSON.parse(lines[0]);
          await saveTokens(providerName, tokens);
          resolve(tokens);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}
