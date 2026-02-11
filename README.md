# chisel-releases-navigator

A tool to easily navigate through the different [chisel-releases](https://github.com/canonical/chisel-releases), and what slice definitions are available in each.

Published at https://canonical.github.io/chisel-releases-navigator/

Chisel Releases Navigator is a statically served page -- it uses `sql.jq` to query a statically served sqlite db which is periodically updated from 

## dev notes

we use date versioning of the form `date +%y%d%m` + `patch` in case there are multiple release on one day. one might tag a release with `git tag "$(date +%y%d%m).1"`