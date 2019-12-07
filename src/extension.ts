"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  ExtensionContext,
  languages,
  Range,
  TextDocument,
  Uri,
  window,
  workspace
} from "vscode";
import { CodeSnippetController } from "./controllers/codeSnippetController";
import { EnvironmentController } from "./controllers/environmentController";
import { HistoryController } from "./controllers/historyController";
import { OAuth2Controller } from "./controllers/oauth2Controller";
import { RequestController } from "./controllers/requestController";
import { ResponseController } from "./controllers/responseController";
import { Logger } from "./logger";
import { CustomVariableDiagnosticsProvider } from "./providers/customVariableDiagnosticsProvider";
import { RequestBodyDocumentLinkProvider } from "./providers/documentLinkProvider";
import { EnvironmentOrFileVariableHoverProvider } from "./providers/environmentOrFileVariableHoverProvider";
import { FileVariableDefinitionProvider } from "./providers/fileVariableDefinitionProvider";
import { FileVariableReferenceProvider } from "./providers/fileVariableReferenceProvider";
import { FileVariableReferencesCodeLensProvider } from "./providers/fileVariableReferencesCodeLensProvider";
import { HttpCodeLensProvider } from "./providers/httpCodeLensProvider";
import { HttpCompletionItemProvider } from "./providers/httpCompletionItemProvider";
import { HttpDocumentSymbolProvider } from "./providers/httpDocumentSymbolProvider";
import { OAuth2LensProvider } from "./providers/OAuth2LensProvider";
import { RequestVariableCompletionItemProvider } from "./providers/requestVariableCompletionItemProvider";
import { RequestVariableDefinitionProvider } from "./providers/requestVariableDefinitionProvider";
import { RequestVariableHoverProvider } from "./providers/requestVariableHoverProvider";
import { AadTokenCache } from "./utils/aadTokenCache";
import { ConfigurationDependentRegistration } from "./utils/dependentRegistration";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
  const logger = new Logger();

  const requestController = new RequestController(context, logger);
  const historyController = new HistoryController(logger);
  const responseController = new ResponseController();
  const codeSnippetController = new CodeSnippetController();
  const environmentController = new EnvironmentController(
    await EnvironmentController.getCurrentEnvironment()
  );
  context.subscriptions.push(requestController);
  context.subscriptions.push(historyController);
  context.subscriptions.push(responseController);
  context.subscriptions.push(codeSnippetController);
  context.subscriptions.push(environmentController);
  context.subscriptions.push(
    commands.registerCommand(
      "rest-client.request",
      (document: TextDocument, range: Range) => requestController.run(range)
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.rerun-last-request", () =>
      requestController.rerun()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.cancel-request", () =>
      requestController.cancel()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.history", () =>
      historyController.save()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.clear-history", () =>
      historyController.clear()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.save-response", () =>
      responseController.save()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.save-response-body", () =>
      responseController.saveBody()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.copy-response-body", () =>
      responseController.copyBody()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.generate-codesnippet", () =>
      codeSnippetController.run()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.copy-codesnippet", () =>
      codeSnippetController.copy()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.copy-request-as-curl", () =>
      codeSnippetController.copyAsCurl()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.switch-environment", () =>
      environmentController.switchEnvironment()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client.clear-aad-token-cache", () =>
      AadTokenCache.clear()
    )
  );
  context.subscriptions.push(
    commands.registerCommand("rest-client._openDocumentLink", args => {
      workspace
        .openTextDocument(Uri.parse(args.path))
        .then(window.showTextDocument, error => {
          window.showErrorMessage(error.message);
        });
    })
  );
  context.subscriptions.push(
    commands.registerCommand(
      "rest-client.oauth2-get-token",
      async (providerName: string) => {
        await OAuth2Controller.getAccessToken(providerName);
        window.showInformationMessage(
          `OAuth2 Tokens for '${providerName}' were saved successfully`
        );
      }
    )
  );
  context.subscriptions.push(
    commands.registerCommand(
      "rest-client.oauth2-refresh-token",
      async (providerName: string) => {
        await OAuth2Controller.refreshToken(providerName);
        window.showInformationMessage(
          `OAuth2 Access Token for '${providerName}' has been refreshed successfully`
        );
      }
    )
  );

  const documentSelector = [
    { language: "http", scheme: "file" },
    { language: "http", scheme: "untitled" }
  ];

  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      documentSelector,
      new HttpCompletionItemProvider()
    )
  );
  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      documentSelector,
      new RequestVariableCompletionItemProvider(),
      "."
    )
  );
  context.subscriptions.push(
    languages.registerHoverProvider(
      documentSelector,
      new EnvironmentOrFileVariableHoverProvider()
    )
  );
  context.subscriptions.push(
    languages.registerHoverProvider(
      documentSelector,
      new RequestVariableHoverProvider()
    )
  );
  context.subscriptions.push(
    new ConfigurationDependentRegistration(
      () =>
        languages.registerCodeLensProvider(
          documentSelector,
          new HttpCodeLensProvider()
        ),
      s => s.enableSendRequestCodeLens
    )
  );
  // TODO:
  //   context.subscriptions.push(
  //     new ConfigurationDependentRegistration(
  //       () =>
  //         languages.registerCodeLensProvider(
  //           documentSelector,
  //           new OAuth2LensProvider()
  //         ),
  //       s => s.enableOAuth2CodeLens
  //     )
  //   );
  languages.registerCodeLensProvider(
    documentSelector,
    new OAuth2LensProvider()
  );

  context.subscriptions.push(
    new ConfigurationDependentRegistration(
      () =>
        languages.registerCodeLensProvider(
          documentSelector,
          new FileVariableReferencesCodeLensProvider()
        ),
      s => s.enableCustomVariableReferencesCodeLens
    )
  );
  context.subscriptions.push(
    languages.registerDocumentLinkProvider(
      documentSelector,
      new RequestBodyDocumentLinkProvider()
    )
  );
  context.subscriptions.push(
    languages.registerDefinitionProvider(
      documentSelector,
      new FileVariableDefinitionProvider()
    )
  );
  context.subscriptions.push(
    languages.registerDefinitionProvider(
      documentSelector,
      new RequestVariableDefinitionProvider()
    )
  );
  context.subscriptions.push(
    languages.registerReferenceProvider(
      documentSelector,
      new FileVariableReferenceProvider()
    )
  );
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider(
      documentSelector,
      new HttpDocumentSymbolProvider()
    )
  );

  const diagnosticsProviders = new CustomVariableDiagnosticsProvider();
  workspace.onDidOpenTextDocument(
    diagnosticsProviders.checkVariables,
    diagnosticsProviders,
    context.subscriptions
  );
  workspace.onDidCloseTextDocument(
    diagnosticsProviders.deleteDocumentFromDiagnosticCollection,
    diagnosticsProviders,
    context.subscriptions
  );
  workspace.onDidSaveTextDocument(
    diagnosticsProviders.checkVariables,
    diagnosticsProviders,
    context.subscriptions
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
