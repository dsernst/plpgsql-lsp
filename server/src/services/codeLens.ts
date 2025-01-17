import { Logger } from "vscode-jsonrpc/node"
import { CodeLens, Range } from "vscode-languageserver-protocol/node"
import { TextDocument } from "vscode-languageserver-textdocument/lib/umd/main"

import { FILE_QUERY_COMMAND } from "@/commands/executeFileQuery"
import { PostgresPool } from "@/postgres"
import { getQueryParameterInfo } from "@/postgres/parameters"
import { Settings } from "@/settings"

import { isCorrectFileValidation } from "./validation"

export async function getCodeLenses(
  pgPool: PostgresPool,
  document: TextDocument,
  settings: Settings,
  logger: Logger,
): Promise<CodeLens[]> {
  const codeLenses: CodeLens[] = []
  if (
    settings.enableExecuteFileQueryCommand
    && getQueryParameterInfo(document, settings, logger) === null
    && await isCorrectFileValidation(pgPool, document, logger)
  ) {
    codeLenses.push(makeExecuteFileQueryCommandCodeLens(document))
  }

  return codeLenses
}

export function makeExecuteFileQueryCommandCodeLens(document: TextDocument): CodeLens {
  const codeLens = CodeLens.create(Range.create(0, 0, 0, 0))
  codeLens.command = {
    title: FILE_QUERY_COMMAND.title,
    command: FILE_QUERY_COMMAND.name,
    arguments: [document.uri],
  }

  return codeLens
}
