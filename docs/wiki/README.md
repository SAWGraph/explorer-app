# Wiki source

These files are the source of truth for the [SAWGraph Explorer wiki](https://github.com/SAWGraph/explorer-app/wiki).
Edit them here, in a pull request, alongside whatever code change they describe.
A GitHub Action copies them into the wiki on every push to `main`.

This `README.md` is the only file that does not get copied.

## How it works

GitHub wikis are flat. Every page is a top level file, and the filename becomes the
page title verbatim, spaces included. So `Dropdowns Substance.md` shows up as the page
"Dropdowns Substance". Folders would be flattened on push, which is why everything sits
side by side with an area name in front of it. The one exception is `images/`, which the
action copies across as a folder so that image links keep working.

Two special filenames:

* `Home.md` is the wiki landing page.
* `_Sidebar.md` is the navigation panel rendered next to every page.

## Adding a page

1. Create `Area Page Name.md` in this folder.
2. Add a link to it from `_Sidebar.md` and from the relevant index page.
3. Open a PR. It syncs when the PR merges.

## Linking back into the code

The wiki lives in a different git repository, so relative links do not reach the source.
Use full GitHub URLs pinned to `main`:

```
https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L97
```

Pin to `main` rather than a commit SHA. A line number that drifts by a few lines is much
cheaper to live with than a link that always points at stale code.

## Screenshots

Put them in `images/` and reference them relatively, `![Substance dropdown](images/dropdown_substance.png)`.
Pages currently reference images that do not exist yet, so those links render as broken
until someone drops the files in. That is deliberate. It is a visible reminder rather than
a silent gap.

## Keeping it honest

Every SPARQL query written down here was run against the live endpoint before it was
documented. If you change a discovery query, rerun it and update the page in the same PR.
