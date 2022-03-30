import { DatabaseError } from "pg"
import { Logger, Range } from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"

import { QueryParameterInfo } from "@/postgres/parameters"
import { PostgresPool } from "@/postgres/pool"
import { getNonSpaceCharacter, getTextAllRange } from "@/utilities/text"


export interface SyntaxError {
  range: Range
  message: string
}

export type SyntaxAnalysisOptions = {
  isComplete: boolean,
  queryParameterInfo: QueryParameterInfo | null,
}

export async function queryFileSyntaxAnalysis(
  pgPool: PostgresPool,
  document: TextDocument,
  options: SyntaxAnalysisOptions,
  logger: Logger,
): Promise<SyntaxError[] | undefined> {
  const fileText = document.getText()

  const pgClient = await pgPool.connect()
  try {
    await pgClient.query("BEGIN")
    await pgClient.query(
      fileText,
      Array(options.queryParameterInfo?.parameterNumber || 0).fill(null),
    )
  }
  catch (error: unknown) {
    const databaseError = error as DatabaseError
    const message = databaseError.toString()

    if (options.isComplete) {
      logger.error(`SyntaxError code: ${databaseError.code || "unknown"}, ${error}`)
    }

    let range: Range | undefined = undefined
    if (error instanceof DatabaseError && error.position !== undefined) {
      const errorPosition = Number(error.position)
      const errorLines = fileText.slice(0, errorPosition).split("\n")
      range = Range.create(
        errorLines.length - 1,
        getNonSpaceCharacter(errorLines[errorLines.length - 1]),
        errorLines.length - 1,
        errorLines[errorLines.length - 1].length,
      )
    }
    else {
      range = getTextAllRange(document)
    }

    return [
      {
        range,
        message,
      },
    ]
  }
  finally {
    await pgClient.query("ROLLBACK")
    pgClient.release()
  }

  return undefined
}
