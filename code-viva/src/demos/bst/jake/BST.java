public class BST {
    class N { int v; N l, r; N(int v) { this.v = v; } }
    N root;

    public void insert(int key) {
        if (root == null) { root = new N(key); return; }
        N t = root;
        while (true) {
            if (key == t.v) return;
            if (key < t.v) {
                if (t.l == null) { t.l = new N(key); return; }
                t = t.l;
            } else {
                if (t.r == null) { t.r = new N(key); return; }
                t = t.r;
            }
        }
    }

    public boolean contains(int key) { return f(root, key); }

    boolean f(N x, int k) {
        if (x == null) return false;
        if (x.v == k) return true;
        return k < x.v ? f(x.l, k) : f(x.r, k);
    }

    public int height() { return h2(root); }

    int h2(N x) {
        if (x == null) return -1;
        int a = h2(x.l), b = h2(x.r);
        return (a > b ? a : b) + 1;
    }

    public java.util.List<Integer> inOrder() {
        java.util.List<Integer> out = new java.util.ArrayList<>();
        java.util.Deque<N> st = new java.util.ArrayDeque<>();
        N cur = root;
        while (cur != null || !st.isEmpty()) {
            while (cur != null) { st.push(cur); cur = cur.l; }
            cur = st.pop();
            out.add(cur.v);
            cur = cur.r;
        }
        return out;
    }
}
