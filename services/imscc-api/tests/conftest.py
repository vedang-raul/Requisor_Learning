"""A small Canvas-style cartridge, built in memory, covering each mapping rule."""
from __future__ import annotations

import io
import zipfile

import pytest

LONG = " ".join(["Teams use AI tools to draft, check and summarise their everyday work."] * 40)

FILES: dict[str, str | bytes] = {
    "imsmanifest.xml": """<?xml version="1.0"?>
<manifest identifier="m" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata><lom><general><title><string>Ignored manifest title</string></title></general></lom></metadata>
  <resources>
    <resource identifier="p1" type="webcontent" href="wiki_content/intro.html"><file href="wiki_content/intro.html"/></resource>
    <resource identifier="p2" type="webcontent" href="wiki_content/reading.html"><file href="wiki_content/reading.html"/></resource>
    <resource identifier="p3" type="webcontent" href="wiki_content/deep.html"><file href="wiki_content/deep.html"/></resource>
    <resource identifier="a1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="a1/brief.html">
      <file href="a1/brief.html"/><file href="a1/assignment_settings.xml"/></resource>
    <resource identifier="q1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="q1/assessment_qti.xml"/></resource>
    <resource identifier="f1" type="webcontent" href="web_resources/Docs/guide%20book.pdf"><file href="web_resources/Docs/guide book.pdf"/></resource>
    <resource identifier="old" type="webcontent" href="wiki_content/old.html"><file href="wiki_content/old.html"/></resource>
    <resource identifier="hidden" type="webcontent" href="wiki_content/hidden.html"><file href="wiki_content/hidden.html"/></resource>
  </resources>
</manifest>""",
    "course_settings/course_settings.xml": """<?xml version="1.0"?>
<course xmlns="http://canvas.instructure.com/xsd/cccv1p0"><title>AI at Work</title></course>""",
    "course_settings/module_meta.xml": """<?xml version="1.0"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="m2"><title>Teachers only</title><workflow_state>unpublished</workflow_state><position>2</position>
    <items><item identifier="i9"><content_type>WikiPage</content_type><workflow_state>active</workflow_state><title>Secret notes</title><identifierref>hidden</identifierref><position>1</position></item></items>
  </module>
  <module identifier="m1"><title>Module 1: Getting started</title><workflow_state>active</workflow_state><position>1</position>
    <items>
      <item identifier="i1"><content_type>ContextModuleSubHeader</content_type><workflow_state>active</workflow_state><title>Week 1</title><position>1</position></item>
      <item identifier="i2"><content_type>WikiPage</content_type><workflow_state>active</workflow_state><title>M1: Welcome video</title><identifierref>p1</identifierref><position>2</position></item>
      <item identifier="i3"><content_type>WikiPage</content_type><workflow_state>active</workflow_state><title>M1: Why AI at work</title><identifierref>p2</identifierref><position>3</position></item>
      <item identifier="i3b"><content_type>WikiPage</content_type><workflow_state>active</workflow_state><title>M1: Deep dive</title><identifierref>p3</identifierref><position>3</position></item>
      <item identifier="i4"><content_type>Assignment</content_type><workflow_state>active</workflow_state><title>M1: Assignment—Map your workflow</title><identifierref>a1</identifierref><position>4</position></item>
      <item identifier="i5"><content_type>Quizzes::Quiz</content_type><workflow_state>active</workflow_state><title>M1: Quiz</title><identifierref>q1</identifierref><position>5</position></item>
      <item identifier="i6"><content_type>Attachment</content_type><workflow_state>active</workflow_state><title>Guide book.pdf</title><identifierref>f1</identifierref><position>6</position></item>
      <item identifier="i7"><content_type>ExternalUrl</content_type><workflow_state>active</workflow_state><title>Prompting guide</title><url>https://example.com/prompting</url><position>7</position></item>
      <item identifier="i8"><content_type>WikiPage</content_type><workflow_state>unpublished</workflow_state><title>Draft page</title><identifierref>p2</identifierref><position>8</position></item>
    </items>
  </module>
</modules>""",
    "course_settings/rubrics.xml": """<?xml version="1.0"?>
<rubrics xmlns="http://canvas.instructure.com/xsd/cccv1p0"><rubric identifier="r1"><title>Workflow rubric</title><points_possible>20</points_possible>
  <criteria>
    <criterion><description>Clear map</description><long_description>Every step is shown.</long_description><points>12</points></criterion>
    <criterion><description>AI ideas</description><long_description>Two realistic ideas.</long_description><points>8</points></criterion>
  </criteria></rubric></rubrics>""",
    "wiki_content/intro.html": """<html><head><title>M1: Welcome video</title></head><body>
<table class="esComponent-esPresentationSectionHeader"><caption>esComponent-esPresentationSectionHeader</caption><tbody>
<tr class="title-row"><th colspan="2"><p>Presentation Section Header</p></th></tr>
<tr class="single-value-row"><td class="key-title"><p>Title</p></td><td><h1>Welcome video</h1></td></tr></tbody></table>
<p>Start here: a short welcome to the course and how it works.</p>
<table class="esComponent-videoBoxWithLinks"><caption>esComponent-videoBoxWithLinks</caption><tbody>
<tr class="title-row"><th colspan="2"><p>Video Box</p></th></tr>
<tr class="single-value-row options-row"><td class="key-options"><p>Options</p></td><td><p>setShadow-false</p></td></tr>
<tr class="single-value-row"><td class="key-title"><p>Title</p></td><td><p>Welcome from your tutor</p></td></tr>
<tr class="single-value-row"><td class="key-iframe"><p>Iframe Embed Code</p></td><td>
<p>## Enter iframe embed code within double curly braces as seen here ##</p>
<p>{{&lt;iframe width="560" src="https://www.youtube.com/embed/AbCdEfGhIjK?si=x"&gt;&lt;/iframe&gt;}}</p></td></tr>
<tr class="single-value-row"><td class="key-otherLinks"><p>Other Links</p></td><td><p>Link1</p><p>## Replace the link placeholder ##</p></td></tr>
</tbody></table></body></html>""",
    "wiki_content/reading.html": f"""<html><body>
<h2>Why AI at work</h2><p>{LONG}</p>
<p>See the <a href="https://example.com/report">2026 report</a> and the
<a href="$IMS-CC-FILEBASE$/Docs/guide%20book.pdf">guide book</a>.</p>
<p><img src="$IMS-CC-FILEBASE$/Images/chart.png" alt="Adoption chart"></p>
<table class="esComponent-callout"><caption>esComponent-callout</caption><tbody>
<tr class="title-row"><th colspan="2"><p>Callout (Summary)</p></th></tr>
<tr><td class="key-options"><p>Options</p></td><td><p>## For Callout Summary consistency ##</p></td></tr>
<tr><td class="key-title"><p>Title</p></td><td><p>Key points</p></td></tr>
<tr><td class="key-content"><p>Content</p></td><td><ul><li>AI drafts, people decide</li><li>Start with one workflow</li></ul></td></tr>
</tbody></table>
<table class="esComponent-contentModal"><caption>esComponent-contentModal</caption><tbody>
<tr><td class="key-launcherText"><p>Launcher Text</p></td><td><p>What should you automate first?</p></td></tr>
<tr><td class="key-body"><p>Body Content</p></td><td><p>The task you repeat most.</p></td></tr>
</tbody></table></body></html>""",
    "wiki_content/deep.html": f"""<html><body><h2>Deep dive</h2>
<iframe src="https://www.youtube.com/embed/ZyXwVuTsRqP"></iframe>
<p>Short opening paragraph about the deep dive and what it covers in this module.</p>
<p>{LONG}</p>
<iframe src="https://www.youtube-nocookie.com/embed/QwErTyUiOpA"></iframe>
</body></html>""",
    "a1/brief.html": """<html><body><h2>Your task</h2><p>Map one workflow in your team and mark two places where AI could help.</p></body></html>""",
    "a1/assignment_settings.xml": """<?xml version="1.0"?>
<assignment identifier="a1" xmlns="http://canvas.instructure.com/xsd/cccv1p0"><title>M1: Assignment—Map your workflow</title>
  <due_at>2026-05-25T04:59:59</due_at><all_day_date>2026-05-24</all_day_date><points_possible>25.0</points_possible>
  <grading_type>points</grading_type><submission_types>online_upload</submission_types><rubric_identifierref>r1</rubric_identifierref>
</assignment>""",
    "q1/assessment_qti.xml": """<?xml version="1.0"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="q1" title="M1: Quiz"><section ident="root">
  <item ident="it1" title="Q1"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>5.0</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext texttype="text/html">&lt;p&gt;What does LLM stand for?&lt;/p&gt;</mattext></material>
      <response_lid ident="response1"><render_choice>
        <response_label ident="c1"><material><mattext>Large Language Model</mattext></material></response_label>
        <response_label ident="c2"><material><mattext>Long Learning Machine</mattext></material></response_label>
      </render_choice></response_lid></presentation>
    <resprocessing><respcondition continue="No"><conditionvar><varequal respident="response1">c1</varequal></conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
  </item>
  <item ident="it2"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_answers_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>4</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext>Pick the AI labs</mattext></material>
      <response_lid ident="response1" rcardinality="Multiple"><render_choice>
        <response_label ident="a"><material><mattext>OpenAI</mattext></material></response_label>
        <response_label ident="b"><material><mattext>IKEA</mattext></material></response_label>
        <response_label ident="c"><material><mattext>Anthropic</mattext></material></response_label>
      </render_choice></response_lid></presentation>
    <resprocessing><respcondition continue="No"><conditionvar><and>
      <varequal respident="response1">a</varequal><not><varequal respident="response1">b</varequal></not><varequal respident="response1">c</varequal>
    </and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
    <itemfeedback ident="general_incorrect_fb"><flow_mat><material><mattext>Think about who builds models.</mattext></material></flow_mat></itemfeedback>
  </item>
  <item ident="it3"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>short_answer_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext>Capital of France?</mattext></material><response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>
    <resprocessing><respcondition continue="No"><conditionvar><varequal respident="response1">Paris</varequal><varequal respident="response1">paris, france</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
  </item>
  <item ident="it4"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>numerical_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>2</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext>Pi to two places?</mattext></material><response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str></presentation>
    <resprocessing><respcondition continue="No"><conditionvar><or><varequal respident="response1">3.14</varequal><and><vargte respident="response1">3.13</vargte><varlte respident="response1">3.15</varlte></and></or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
  </item>
  <item ident="it5"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>matching_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>2</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext>Match the model to its maker</mattext></material>
      <response_lid ident="response_m1"><material><mattext>GPT</mattext></material><render_choice>
        <response_label ident="r1"><material><mattext>OpenAI</mattext></material></response_label>
        <response_label ident="r2"><material><mattext>Anthropic</mattext></material></response_label>
        <response_label ident="r3"><material><mattext>IKEA</mattext></material></response_label></render_choice></response_lid>
      <response_lid ident="response_m2"><material><mattext>Claude</mattext></material><render_choice>
        <response_label ident="r1"><material><mattext>OpenAI</mattext></material></response_label>
        <response_label ident="r2"><material><mattext>Anthropic</mattext></material></response_label>
        <response_label ident="r3"><material><mattext>IKEA</mattext></material></response_label></render_choice></response_lid>
    </presentation>
    <resprocessing>
      <respcondition><conditionvar><varequal respident="response_m1">r1</varequal></conditionvar><setvar varname="SCORE" action="Add">50</setvar></respcondition>
      <respcondition><conditionvar><varequal respident="response_m2">r2</varequal></conditionvar><setvar varname="SCORE" action="Add">50</setvar></respcondition>
    </resprocessing>
  </item>
  <item ident="it6"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>essay_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>10</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext>&lt;p&gt;Explain one &lt;strong&gt;risk&lt;/strong&gt;.&lt;/p&gt;</mattext></material><response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>
  </item>
  <item ident="it7"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>calculated_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
    <presentation><material><mattext>What is [x] + 2?</mattext></material></presentation>
  </item>
  </section></assessment></questestinterop>""",
    "q1/assessment_meta.xml": """<?xml version="1.0"?>
<quiz identifier="q1" xmlns="http://canvas.instructure.com/xsd/cccv1p0"><title>M1: Quiz</title>
  <description>&lt;p&gt;Two attempts; your &lt;strong&gt;highest&lt;/strong&gt; score counts.&lt;/p&gt;</description>
  <due_at>2026-05-25T04:59:59Z</due_at><time_limit>20</time_limit><shuffle_answers>true</shuffle_answers><scoring_policy>keep_highest</scoring_policy>
  <points_possible>20.0</points_possible><show_correct_answers>true</show_correct_answers><show_correct_answers_last_attempt>true</show_correct_answers_last_attempt>
  <allowed_attempts>2</allowed_attempts><one_question_at_a_time>false</one_question_at_a_time><cant_go_back>false</cant_go_back>
</quiz>""",
    "web_resources/Docs/guide book.pdf": b"%PDF-1.4 tiny",
    "web_resources/Images/chart.png": b"\x89PNG tiny",
    "wiki_content/old.html": "<html><head><title>Old course page</title></head><body><p>Left over.</p></body></html>",
    "wiki_content/hidden.html": "<html><body><p>Only for teachers.</p></body></html>",
}


def make_zip(files: dict[str, str | bytes], prefix: str = "") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(prefix + name, content if isinstance(content, bytes) else content.encode("utf-8"))
    return buf.getvalue()


@pytest.fixture
def cartridge() -> bytes:
    return make_zip(FILES)
