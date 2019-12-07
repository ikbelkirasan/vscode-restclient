"use strict";

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import puppeteer from "puppeteer-core";
import * as qs from "querystring";
import { URL } from "url";
import { workspace } from "vscode";

const CHROME_PATH = "/usr/bin/google-chrome"; // TODO: set in settings

const generateRandomString = length => {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

class OAuth2 {
  static async getAuthorizationCode({ config, options }) {
    options = options || {};

    if (!config.redirectUri) {
      config.redirectUri = "urn:ietf:wg:oauth:2.0:oob";
    }

    const urlParams = {
      response_type: "code",
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      state: generateRandomString(16)
    };

    if (options.scope) {
      (urlParams as any).scope = options.scope.join(" ");
    }

    if (options.accessType) {
      (urlParams as any).access_type = options.accessType;
    }

    const url = config.authorizationUrl + "?" + qs.stringify(urlParams);

    const browser = await puppeteer.launch({
      headless: false,
      executablePath: CHROME_PATH
    });
    const page = await browser.newPage();
    page.setRequestInterception(true);

    const p = new Promise((resolve, reject) => {
      page.on("request", req => {
        if (req.isNavigationRequest()) {
          const url = new URL(req.url());
          if (url.hostname === "localhost") {
            req.abort();
            const result = {
              code: url.searchParams.get("code"),
              error: url.searchParams.get("error")
            };
            return resolve(result);
          }
        }
        req.continue();
      });
    });

    await page.goto(url);

    const { error, code } = (await p) as any;
    await browser.close();

    if (error) {
      throw error;
    }

    return { code };
  }

  static async tokenRequest({ config, data }) {
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
  }

  static async getAccessToken({ config, options }) {
    const { code } = await this.getAuthorizationCode({
      config,
      options
    });
    const tokenRequestData = {
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      ...options.additionalTokenRequestData
    };

    const token = await this.tokenRequest({ config, data: tokenRequestData });

    return token;
  }

  static async refreshToken({ config, refreshToken }) {
    return this.tokenRequest({
      config,
      data: {
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        redirect_uri: config.redirectUri
      }
    });
  }
}

class Storage {
  static read(filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, "utf8", (error, data) => {
        if (error) {
          return reject(error);
        }
        return resolve(JSON.parse(data));
      });
    });
  }

  static save(filePath: string, data: object) {
    return new Promise((resolve, reject) => {
      const str = JSON.stringify(data, null, 2);
      fs.writeFile(filePath, str, error => {
        if (error) {
          return reject(error);
        }
        return resolve();
      });
    });
  }
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

    return Storage.read(filePath);
  }

  static async saveTokens(providerName: string, tokens: object) {
    if (!workspace.workspaceFolders) {
      throw new Error("No workspace folder is open");
    }
    const filePath = path.join(
      workspace.workspaceFolders[0].uri.fsPath as string,
      ".rest-client/oauth2/tokens/",
      `${providerName}.json`
    );

    return Storage.save(filePath, tokens);
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

    return Storage.read(filePath);
  }

  public static async refreshToken(providerName: string) {
    const { config } = (await this.readConfig(providerName)) as any;
    const tokens = (await this.readTokens(providerName)) as any;
    const { refresh_token: refreshToken } = tokens;
    const { access_token: accessToken } = await OAuth2.refreshToken({
      config,
      refreshToken
    });
    tokens.access_token = accessToken;
    await this.saveTokens(providerName, tokens);
  }

  public static async getAccessToken(providerName: string) {
    const { config, options } = (await this.readConfig(providerName)) as any;
    const tokens = await OAuth2.getAccessToken({ config, options });
    await this.saveTokens(providerName, tokens);
  }
}
