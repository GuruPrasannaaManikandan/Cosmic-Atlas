using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// Minimal JSON reader for the mission-data files (objects → Dictionary, arrays → List, numbers → double).
    /// JsonUtility cannot read top-level arrays, mixed-type fields or arrays of arrays, and the runtime assembly takes
    /// no third-party dependency.
    /// </summary>
    public static class MiniJson
    {
        public static object Parse(string s)
        {
            int i = 0;
            var v = Value(s, ref i);
            Ws(s, ref i);
            if (i != s.Length) throw new FormatException("trailing characters at " + i);
            return v;
        }

        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            if (i >= s.Length) throw new FormatException("unexpected end");
            char c = s[i];
            if (c == '{') return Obj(s, ref i);
            if (c == '[') return Arr(s, ref i);
            if (c == '"') return Str(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int j = i;
            while (j < s.Length && "+-0123456789.eE".IndexOf(s[j]) >= 0) j++;
            if (j == i) throw new FormatException("bad token at " + i);
            var d = double.Parse(s.Substring(i, j - i), NumberStyles.Float, CultureInfo.InvariantCulture);
            i = j;
            return d;
        }

        static Dictionary<string, object> Obj(string s, ref int i)
        {
            var o = new Dictionary<string, object>();
            i++;
            Ws(s, ref i);
            if (s[i] == '}') { i++; return o; }
            while (true)
            {
                Ws(s, ref i);
                var k = Str(s, ref i);
                Ws(s, ref i);
                if (s[i++] != ':') throw new FormatException("':' expected at " + i);
                o[k] = Value(s, ref i);
                Ws(s, ref i);
                char c = s[i++];
                if (c == '}') return o;
                if (c != ',') throw new FormatException("',' expected at " + i);
            }
        }

        static List<object> Arr(string s, ref int i)
        {
            var a = new List<object>();
            i++;
            Ws(s, ref i);
            if (s[i] == ']') { i++; return a; }
            while (true)
            {
                a.Add(Value(s, ref i));
                Ws(s, ref i);
                char c = s[i++];
                if (c == ']') return a;
                if (c != ',') throw new FormatException("',' expected at " + i);
            }
        }

        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("string expected at " + i);
            i++;
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
            i++;
            return sb.ToString();
        }

        // ---- typed helpers ----
        public static Dictionary<string, object> O(object o) => (Dictionary<string, object>)o;
        public static List<object> A(object o) => (List<object>)o;
        public static double D(object o) => Convert.ToDouble(o, CultureInfo.InvariantCulture);
        public static float F(object o) => (float)D(o);
        public static int I(object o) => (int)Math.Round(D(o));

        public static float[] Floats(object o)
        {
            var a = A(o);
            var r = new float[a.Count];
            for (int k = 0; k < r.Length; k++) r[k] = F(a[k]);
            return r;
        }

        public static int[] Ints(object o)
        {
            var a = A(o);
            var r = new int[a.Count];
            for (int k = 0; k < r.Length; k++) r[k] = I(a[k]);
            return r;
        }

        /// <summary>JSON string literal for reports.</summary>
        public static string Q(string s) =>
            s == null ? "null" : "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n") + "\"";

        public static string N(double d) => double.IsNaN(d) || double.IsInfinity(d) ? "null" : d.ToString("R", CultureInfo.InvariantCulture);
    }
}
