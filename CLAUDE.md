# Project Instructions — iron-doctrine

## Workflow (overrides global branch-first rule for this project)
Progetto in sviluppo solitario, nessun altro contributor attivo.
- Si usa **jj** (Jujutsu), colocato con il repo git esistente (`jj git init --colocate`)
- Si lavora **direttamente su `main`**, niente branch dedicati per ogni task
- `main` locale è tracciato su `main@origin`
- Il resto delle regole globali (commit workflow, commit message format, verifica pre-commit, niente commit autonomi) resta valido

## Valutazione del rischio delle modifiche
- Si usa **serval** (`serval inspect <path>` / `serval diff`), servizio locale già installato, per stimare il blast radius di un file/modifica prima di intervenire su codice sensibile (rendering, protocollo di rete, engine di simulazione)
- Va lanciato quando la modifica tocca file con molte dipendenze o storicamente instabili, non per ogni piccolo fix
