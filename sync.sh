baseDir=$(dirname $0)

cd $baseDir/../

pwd

rsync -av  prosemirror-commands/src/* prosemirror/commands
rsync -av  prosemirror-dropcursor/src prosemirror/dropcursor
rsync -av  prosemirror-gapcursor/src/* prosemirror/gapcursor
rsync -av  prosemirror-history/src/* prosemirror/history
rsync -av  prosemirror-inputrules/src/* prosemirror/inputrules
rsync -av  prosemirror-keymap/src/* prosemirror/keymap
rsync -av  prosemirror-model/src/* prosemirror/model
rsync -av  prosemirror-schema-list/*/src prosemirror/schemaList
rsync -av  prosemirror-state/src/* prosemirror/state
rsync -av  prosemirror-tables/src/* prosemirror/tables
rsync -av  prosemirror-transform/src/* prosemirror/transform
rsync -av  prosemirror-utils/src/* prosemirror/utils
rsync -av  prosemirror-view/src/* prosemirror/view
rsync -av  rope-sequence/index.ts prosemirror/rope-sequence/
rsync -av  orderedmap/* prosemirror/orderedmap
rsync -av  w3c-keyname/*  prosemirror/w3c-keyname
