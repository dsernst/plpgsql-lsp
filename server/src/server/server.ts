import {
  ClientCapabilities,
  Connection,
  DidChangeConfigurationNotification,
  InitializedParams,
  InitializeParams,
  InitializeResult,
  Logger,
  TextDocuments,
  TextDocumentSyncKind,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"

import { COMMAND_NAMES } from "@/commands"
import { PostgresPoolMap } from "@/postgres"

import { DEFAULT_SETTINGS } from "../settings"
import { CommandExecuter } from "./commandExecuter"
import { DefinitionsManager } from "./definitionsManager"
import { Handlers } from "./handlers"
import { SettingsManager } from "./settingsManager"
import { SymbolsManager } from "./symbolsManager"

export class Server {
  handlers?: Handlers
  pgPools: PostgresPoolMap = new Map()
  // Create a simple text document manager. The text document manager
  // supports full document sync only
  documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
  // Cache the settings of all open documents
  settingsManager: SettingsManager
  // PostgresSQL file definitions.
  definitionsManager: DefinitionsManager = new DefinitionsManager()
  symbolsManager: SymbolsManager = new SymbolsManager()
  commandExecuter?: CommandExecuter

  // Language client configuration
  private capabilities?: ClientCapabilities
  private workspaceFolders: WorkspaceFolder[] = []
  private clientDynamicRegisterSupport = false
  private hasConfigurationCapability = false
  private hasWsChangeWatchedFileDynamicRegistration = false
  private hasDiagnosticRelatedInformationCapability = false

  constructor(
    private connection: Connection,
    public logger: Logger,
  ) {
    this.documents.listen(this.connection)
    this.settingsManager = new SettingsManager(
      connection, { hasConfigurationCapability: undefined },
    )

    this.connection.onInitialize(params => this.onInitialize(params))
    this.connection.onInitialized(params => this.onInitialized(params))
  }

  /**
   * Manual initialization.
   *
   * Used only for testing.
   */
  initialize(params: InitializeParams): void {
    this.onInitialize(params)
  }

  start(): void {
    this.connection.listen()
  }

  private onInitialize(params: InitializeParams): InitializeResult {
    this.capabilities = params.capabilities
    this.workspaceFolders = params.workspaceFolders || []

    const textDocument = this.capabilities.textDocument
    const workspace = this.capabilities.workspace

    this.clientDynamicRegisterSupport = !!(
      textDocument &&
      textDocument.rangeFormatting &&
      textDocument.rangeFormatting.dynamicRegistration
    )

    this.hasConfigurationCapability = !!(
      workspace && !!workspace.configuration
    )

    this.hasWsChangeWatchedFileDynamicRegistration = !!(
      workspace &&
      workspace.didChangeWatchedFiles &&
      workspace.didChangeWatchedFiles.dynamicRegistration
    )

    this.hasDiagnosticRelatedInformationCapability = !!(
      params.capabilities.textDocument &&
      params.capabilities.textDocument.publishDiagnostics &&
      params.capabilities.textDocument.publishDiagnostics.relatedInformation
    )

    this.initializeSettingsManager()

    this.commandExecuter = new CommandExecuter(
      this.pgPools,
      this.documents,
      this.settingsManager,
      this.logger,
    )

    // Register all features that the language server has
    this.handlers = new Handlers(
      this.connection,
      this.pgPools,
      this.documents,
      this.settingsManager,
      this.definitionsManager,
      this.symbolsManager,
      this.commandExecuter,
      {
        hasDiagnosticRelatedInformationCapability:
          this.hasDiagnosticRelatedInformationCapability,
      },
      this.logger,
    )

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: { resolveProvider: false },
        hoverProvider: true,
        definitionProvider: true,
        executeCommandProvider: { commands: COMMAND_NAMES },
        codeActionProvider: true,
        codeLensProvider: {
          resolveProvider: false,
        },
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        workspace: {
          workspaceFolders: {
            changeNotifications: true,
            supported: true,
          },
        },
      },
    }
  }

  private async onInitialized(_params: InitializedParams): Promise<void> {
    if (this.hasConfigurationCapability
      && this.clientDynamicRegisterSupport
    ) {
      // Register for all configuration changes.
      try {
        await this.connection.client.register(
          DidChangeConfigurationNotification.type, undefined,
        )
      }
      catch (error: unknown) {
        this.logger.error(
          "DidChangeConfigurationNotification cannot register."
          + ` ${(error as Error).message}`,
        )
      }
    }

    if (this.hasWsChangeWatchedFileDynamicRegistration) {
      this.connection.workspace.onDidChangeWorkspaceFolders(
        (changedFolders) => {
          this.workspaceFolders = this.getChangedWorkspaceFolders(
            this.workspaceFolders, changedFolders,
          )
        },
      )
    }
  }

  private initializeSettingsManager(): void {
    if (this.hasConfigurationCapability) {
      this.settingsManager = new SettingsManager(this.connection, {
        hasConfigurationCapability: this.hasConfigurationCapability,
        documentSettingsMap: new Map(),
      })
    }
    else {
      this.settingsManager = new SettingsManager(this.connection, {
        hasConfigurationCapability: this.hasConfigurationCapability,
        globalSettings: DEFAULT_SETTINGS,
      })
    }
  }

  private getChangedWorkspaceFolders(
    workspaceFolders: WorkspaceFolder[],
    changedFolders: WorkspaceFoldersChangeEvent,
  ): WorkspaceFolder[] {
    workspaceFolders = workspaceFolders
      .filter((workspaceFolder) => {
        return !changedFolders.removed.some((changedFolder) => {
          return changedFolder.uri === workspaceFolder.uri
        })
      })

    workspaceFolders = workspaceFolders
      .filter((workspaceFolder) => {
        return !changedFolders.added.some((changedFolder) => {
          return changedFolder.uri === workspaceFolder.uri
        })
      })
      .concat(changedFolders.added)

    return workspaceFolders
  }
}
