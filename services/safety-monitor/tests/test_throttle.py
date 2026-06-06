import pytest

from monitor.throttle import Throttle


def test_never_seen_session_is_checkable():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    assert t.should_check("sess-1", now=0)


def test_first_check_then_blocked_until_base_interval():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.touch("sess-1", now=0)
    t.mark_checked("sess-1", now=0)
    assert not t.should_check("sess-1", now=14.9)
    assert t.should_check("sess-1", now=15.1)


def test_escalated_interval_after_high_severity_alert():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.touch("sess-1", now=0)
    t.mark_checked("sess-1", now=0)
    t.mark_alert("sess-1", severity="high", now=0)
    assert not t.should_check("sess-1", now=4.9)
    assert t.should_check("sess-1", now=5.1)


def test_escalated_interval_after_critical_severity():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.mark_checked("sess-1", now=10)
    t.mark_alert("sess-1", severity="critical", now=10)
    assert not t.should_check("sess-1", now=14.9)
    assert t.should_check("sess-1", now=15.1)


def test_low_or_medium_keeps_base_interval():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.mark_checked("sess-1", now=0)
    t.mark_alert("sess-1", severity="medium", now=0)
    # Still on base 15s.
    assert not t.should_check("sess-1", now=14.9)
    assert t.should_check("sess-1", now=15.1)


def test_cull_inactive_drops_old_sessions():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.touch("sess-1", now=0)
    t.touch("sess-2", now=400)
    assert t.cull_inactive(now=400) == 1
    assert "sess-1" not in t
    assert "sess-2" in t


def test_cull_preserves_recently_touched_sessions():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.touch("sess-1", now=0)
    t.touch("sess-1", now=290)
    assert t.cull_inactive(now=400) == 0
    assert "sess-1" in t


def test_active_session_ids_listing():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.touch("sess-1", now=0)
    t.touch("sess-2", now=0)
    assert set(t.active_session_ids()) == {"sess-1", "sess-2"}


def test_invalid_intervals_raise():
    with pytest.raises(ValueError):
        Throttle(base_interval_s=0, escalated_interval_s=5, ttl_s=300)
    with pytest.raises(ValueError):
        Throttle(base_interval_s=15, escalated_interval_s=-1, ttl_s=300)


def test_last_severity_reported():
    t = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=300)
    t.touch("sess-1", now=0)
    t.mark_alert("sess-1", severity="high", now=0)
    assert t.last_severity("sess-1") == "high"
    assert t.last_severity("never-seen") is None
