<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * The index port.
 *
 * Search is a projection, so this interface has no "publish" or "edit" method:
 * documents arrive from the listing source and every write carries the source
 * version it was built from. `rebuild()` is the whole reset path; there is no
 * separate "fix one row" API that could drift from it.
 */
interface SearchIndex
{
    public const INDEXED = 'INDEXED';
    public const UNCHANGED = 'UNCHANGED';

    /**
     * Project one listing. Returns INDEXED when the row changed and UNCHANGED
     * when the same version and content were already present.
     */
    public function index(SearchDocument $document): string;

    /**
     * Project a full source snapshot. Idempotent: the same versions and content
     * produce UNCHANGED for every document and leave the stored rows untouched.
     *
     * @param list<SearchDocument> $documents
     */
    public function rebuild(array $documents): RebuildReport;

    public function search(SearchQuery $query): SearchPage;

    /**
     * The debug view: every match with the terms and filters that admitted it.
     * Deliberately ignores offset/limit — a paginated explanation hides the row
     * somebody is asking about.
     *
     * @return list<SearchExplanation>
     */
    public function explain(SearchQuery $query): array;

    public function document(string $listingId): ?SearchDocument;

    /**
     * Listing ids whose indexed source version is behind the version the source
     * currently reports. This is how a stale projection is found without
     * trusting the index to describe itself.
     *
     * @param array<string,int> $sourceVersions
     * @return list<string>
     */
    public function staleAgainst(array $sourceVersions): array;
}
