import { Logger } from "vscode-jsonrpc/node"
import {
  ExecuteCommandParams, TextDocuments,
} from "vscode-languageserver/node"
import { TextDocument } from "vscode-languageserver-textdocument/lib/umd/main"

import { CommandName } from "@/commands"
import { FILE_QUERY_COMMAND } from "@/commands/executeFileQuery"
import {
  CannotExecuteCommandWithQueryParametersError,
  CommandNotFoundError,
  DisableLanguageServerError,
  ExecuteFileQueryCommandDisabledError,
  NotCoveredFileError,
  PostgresPoolNotFoundError,
  WrongCommandArgumentsError,
} from "@/errors"
import { getPool, PostgresPoolMap } from "@/postgres"
import { getQueryParameterInfo } from "@/postgres/parameters"
import { disableLanguageServer } from "@/utilities/disableLanguageServer"

import { SettingsManager } from "./settingsManager"

export class CommandExecuter {
  constructor(
    private readonly pgPools: PostgresPoolMap,
    private readonly documents: TextDocuments<TextDocument>,
    private readonly settingsManager: SettingsManager,
    private readonly logger: Logger,
  ) { }

  async execute(params: ExecuteCommandParams): Promise<void> {
    const commandName = params.command as CommandName

    switch (commandName) {
      case FILE_QUERY_COMMAND.name: {
        return this.executeFileQueryCommand(params)
      }
      default: {
        const unknownCommand: never = commandName
        throw new CommandNotFoundError(unknownCommand)
      }
    }
  }

  private async executeFileQueryCommand(
    params: ExecuteCommandParams,
  ): Promise<void> {
    if (params.arguments === undefined) {
      throw new WrongCommandArgumentsError()
    }

    const documentUri = params.arguments[0]
    const document = this.documents.get(documentUri)
    if (document === undefined) {
      throw new NotCoveredFileError()
    }

    if (disableLanguageServer(document)) {
      throw new DisableLanguageServerError()
    }

    const settings = await this.settingsManager.get(documentUri)
    if (!settings.enableExecuteFileQueryCommand) {
      throw new ExecuteFileQueryCommandDisabledError()
    }

    if (getQueryParameterInfo(document, settings, this.logger) !== null) {
      throw new CannotExecuteCommandWithQueryParametersError()
    }

    const pgPool = await getPool(this.pgPools, settings, this.logger)
    if (pgPool === undefined) {
      throw new PostgresPoolNotFoundError()
    }

    await FILE_QUERY_COMMAND.execute(pgPool, document, this.logger)
  }
}
