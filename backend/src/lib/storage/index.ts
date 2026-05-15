import * as agents from "./agents";
import * as files from "./files";
import * as groups from "./groups";
import * as messages from "./messages";
import * as workspaces from "./workspaces";

export const store = {
  ...agents,
  ...files,
  ...groups,
  ...messages,
  ...workspaces,
};
