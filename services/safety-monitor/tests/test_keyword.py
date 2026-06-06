from monitor.keyword import CRITICAL_PHRASES, hits_critical


def test_gas_keyword_fires():
    assert hits_critical("there's gas in the room")


def test_uppercase_fires():
    assert hits_critical("I SMELL SMOKE")


def test_all_phrases_match_in_isolation():
    for p in CRITICAL_PHRASES:
        assert hits_critical(f"someone said {p}"), p


def test_substring_of_word_does_not_match():
    # 'sparks' must not match 'sparkling water'.
    assert not hits_critical("sparkling water at lunch")
    # 'fire' must not match 'wildfire reports'.
    assert not hits_critical("wildfire reports on the news")


def test_off_domain_does_not_match():
    assert not hits_critical("I am pressing the start button")
    assert not hits_critical("the valve is stuck but I will try again")


def test_empty_input_does_not_match():
    assert not hits_critical("")
    assert not hits_critical("   \n\t  ")


def test_none_input_does_not_match():
    assert not hits_critical(None)


def test_critical_set_matches_worker_dialogue():
    # Kept in sync by hand; if you bump worker-dialogue's CRITICAL_PHRASES,
    # bump this too. The set is a guard against drift, not a hard contract.
    expected = {
        "gas",
        "smoke",
        "smoking",
        "fire",
        "sparks",
        "sparking",
        "shock",
        "burning",
        "hurt",
        "pain",
    }
    assert CRITICAL_PHRASES == expected
