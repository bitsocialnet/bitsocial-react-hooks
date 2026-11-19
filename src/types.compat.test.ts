// @vitest-environment node
import type * as TypeScript from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ts = createRequire(import.meta.url)("typescript") as typeof TypeScript;

// Vitest transpiles TypeScript without checking assignments. Compile a consumer against the
// actual declarations and return its type errors.
const compileConsumer = (fileName: string, consumer: string) => {
  const consumerPath = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const options: TypeScript.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (path) => (path === consumerPath ? consumer : readFile(path));
  const program = ts.createProgram([consumerPath], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
};

// Adding an optional named field must not silently make Comment incompatible with existing
// consumers whose target shapes have only optional fields.
test("open protocol types remain assignable to consumers selecting optional fields and arrays", () => {
  const consumer = `
    import type { Comment, PublishCommentOptions, CreateCommentOptions } from "./types";
    declare const comment: Comment;
    declare const comments: Comment[];
    const byCid: { cid?: string } = comment;
    const byContent: { content?: string } = comment;
    const byDeleted: { deleted?: boolean } = comment;
    const cidList: { cid?: string }[] = comments;
    const contentList: { content?: string }[] = comments;
    const deletedList: { deleted?: boolean }[] = comments;
    declare const publishOptions: PublishCommentOptions;
    declare const createOptions: CreateCommentOptions;
    const publishTarget: { communityAddress?: string; content?: string } = publishOptions;
    const createTarget: { communityAddress?: string; content?: string } = createOptions;
  `;
  expect(compileConsumer("comment-consumer.ts", consumer)).toEqual([]);
});

test("publishChallengeAnswers takes answers keyed by challenge index and requires answers", () => {
  const consumer = `
    import type { ChallengeAnswersByIndex, UsePublishCommentResult } from "./types";
    declare const result: UsePublishCommentResult;
    const answers: ChallengeAnswersByIndex = { "0": "4", "3": "blue" };
    result.publishChallengeAnswers(answers);
    result.publishChallengeAnswers({ challengeAnswers: answers });
    // deprecated, still accepted
    result.publishChallengeAnswers(["4"]);
    result.publishChallengeAnswers({ challengeAnswers: ["4"] });
    // @ts-expect-error answers are required
    result.publishChallengeAnswers();
    // @ts-expect-error answers are strings
    result.publishChallengeAnswers({ "0": 4 });
  `;
  expect(compileConsumer("challenge-consumer.ts", consumer)).toEqual([]);
});
